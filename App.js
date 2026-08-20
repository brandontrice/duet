import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from './lib/supabase';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import {
  useFonts,
  Fraunces_400Regular,
  Fraunces_600SemiBold,
  Fraunces_900Black,
  Fraunces_900Black_Italic,
} from '@expo-google-fonts/fraunces';

import { GOLD, PLAYER_SLOTS, SKIP_TIMEOUT_MS, INSTAGRAM_USERNAME } from './theme';
import { PROMPTS } from './data/prompts';
import { getLocalDateString } from './lib/dates';
import { styles } from './styles';
import { StageBackground, ProgressDots } from './components/chrome';

import { AuthPage } from './pages/AuthPage';
import { PairingPage } from './pages/PairingPage';
import { SoloWaitingPage } from './pages/SoloWaitingPage';
import { ErrorPage } from './pages/ErrorPage';
import { LandingPage } from './pages/LandingPage';
import { AnswerPage } from './pages/AnswerPage';
import { PredictPage } from './pages/PredictPage';
import { SkipWaitingPage } from './pages/SkipWaitingPage';
import { SkipRequestPage } from './pages/SkipRequestPage';
import { WaitingPage } from './pages/WaitingPage';
import { RevealPage } from './pages/RevealPage';

// ---------------------------------------------------------------------------
// PHASE 2 — THE LIVE GAME LOOP. Two real phones, one database.
//   • Round state lives in Supabase: start_todays_round() picks the question
//     (including Redemption Wednesdays and Author Night Saturdays), and
//     submit_answer() scores the wager server-side.
//   • Realtime flips the waiting screen the instant the partner locks in,
//     answers a skip request, or triggers the reveal.
//   • The landing page reads real numbers: weekly-season scores, streak,
//     freezes, and last week's crowned winner via get_scoreboard().
//   • Skip flow rides the skip_requests table; 6h auto-expire is enforced
//     by whichever client notices first.
//   • Identity comes from the signed-in session. The debug toggle is dead.
// ---------------------------------------------------------------------------

export default function App() {
  const [fontsLoaded] = useFonts({
    Fraunces_400Regular,
    Fraunces_600SemiBold,
    Fraunces_900Black,
    Fraunces_900Black_Italic,
  });

  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Couple status: 'loading' | 'unpaired' | 'solo' (waiting on partner) | 'paired'
  const [couple, setCouple] = useState({ status: 'loading', id: null, inviteCode: null, members: [], codes: [] });
  const [soloView, setSoloView] = useState('home'); // 'home' | 'invite'
  const [generating, setGenerating] = useState(false);

  const fetchCoupleStatus = async () => {
    const userId = session?.user?.id;
    if (!userId) return;

    const { data: membership } = await supabase
      .from('couple_members')
      .select('couple_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!membership) {
      setCouple({ status: 'unpaired', id: null, inviteCode: null, members: [], codes: [] });
      return;
    }

    const [{ data: coupleRow }, { data: members }, { data: codes }] = await Promise.all([
      supabase.from('couples').select('invite_code').eq('id', membership.couple_id).single(),
      supabase
        .from('couple_members')
        .select('user_id, joined_at, profiles(display_name)')
        .eq('couple_id', membership.couple_id)
        .order('joined_at', { ascending: true }),
      supabase
        .from('invite_codes')
        .select('code, created_at')
        .eq('couple_id', membership.couple_id)
        .order('created_at', { ascending: true }),
    ]);

    setCouple({
      status: (members?.length ?? 0) >= 2 ? 'paired' : 'solo',
      id: membership.couple_id,
      inviteCode: coupleRow?.invite_code ?? null,
      members: members ?? [],
      codes: codes ?? [],
    });
  };

  useEffect(() => {
    if (session) fetchCoupleStatus();
    else setCouple({ status: 'loading', id: null, inviteCode: null, members: [], codes: [] });
  }, [session]);

  // While solo: listen for the partner joining and refetch when it happens.
  useEffect(() => {
    if (couple.status !== 'solo' || !couple.id) return;
    const channel = supabase
      .channel('couple-join')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'couple_members', filter: `couple_id=eq.${couple.id}` },
        () => fetchCoupleStatus()
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [couple.status, couple.id]);

  // --- Player identity: derived from the session, not a toggle -----------------
  // Creator (first joined_at) is slot 0 (rose), joiner is slot 1 (teal).

  const myId = session?.user?.id ?? null;

  const { me, partner } = useMemo(() => {
    const make = (member, slot) => ({
      id: member?.user_id ?? `slot-${slot}`,
      name: member?.profiles?.display_name ?? (slot === 0 ? 'Player 1' : 'Player 2'),
      ...PLAYER_SLOTS[slot],
    });
    const list = [make(couple.members?.[0], 0), make(couple.members?.[1], 1)];
    const mine = list.find((p) => p.id === myId) ?? list[0];
    const theirs = list.find((p) => p.id !== mine.id) ?? list[1];
    return { me: mine, partner: theirs };
  }, [couple.members, myId]);

  // --- Audio (unchanged from Phase 1) -------------------------------------------

  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const music = useAudioPlayer(require('./assets/theme.mp3'));
  const music2 = useAudioPlayer(require('./assets/theme2.mp3'));
  const voice = useAudioPlayer(require('./assets/duet-voice.mp3'));

  // --- SOUND EFFECTS (scaffolded — uncomment when the files exist) -----------
  // const tapSfx = useAudioPlayer(require('./assets/tap.mp3'));
  // const lockSfx = useAudioPlayer(require('./assets/lock.mp3'));
  // const stingSfx = useAudioPlayer(require('./assets/sting.mp3'));

  const safePlay = (player, { restart = false } = {}) => {
    try {
      if (restart) player.seekTo(0);
      player.play();
    } catch (e) {
      if (__DEV__) console.warn('audio play failed:', e.message);
    }
  };

  const safePause = (player) => {
    try { player.pause(); } catch {}
  };

  const playSfx = (player) => {
    // if (player) safePlay(player, { restart: true });
  };

  // Configure the iOS audio session once. Without this, activation is at the
  // mercy of defaults, and music won't play with the ringer on silent.
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
    }).catch(() => {});
  }, []);

  useEffect(() => {
    music.loop = true;
    music.volume = 0.2;
    safePlay(music);
    music2.loop = true;
    music2.volume = 0.2;
  }, []);

  useEffect(() => {
    if (entered) {
      safePause(music);
      if (!mutedRef.current) {
        safePlay(music2, { restart: true });
      }
    } else {
      safePause(music2);
      if (!mutedRef.current) {
        safePlay(music);
      }
    }
  }, [entered]);

  useEffect(() => {
    mutedRef.current = muted;
    if (muted) {
      safePause(music);
      safePause(music2);
      safePause(voice);
    } else if (entered) {
      safePlay(music2);
    } else {
      safePlay(music);
    }
  }, [muted, entered]);

  useEffect(() => {
    if (entered) return; // landing-page ambiance only — no sting over gameplay
    const interval = setInterval(() => {
      if (!mutedRef.current) {
        safePlay(voice, { restart: true });
      }
    }, 11000);
    return () => clearInterval(interval);
  }, [entered]);

  // --- LIVE round state -----------------------------------------------------
  // Everything below is a mirror of the database; loadRound() is the single
  // sync point and is safe to call repeatedly (realtime, foreground, midnight).

  const [gameStatus, setGameStatus] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'error'
  const [gameError, setGameError] = useState(null);
  const [round, setRound] = useState(null);              // row from start_todays_round
  const [customPrompt, setCustomPrompt] = useState(null); // custom_prompts row when applicable
  const [mySubmitted, setMySubmitted] = useState(false);
  const [partnerSubmitted, setPartnerSubmitted] = useState(false);
  const [submissions, setSubmissions] = useState(null);  // { [user_id]: row } after reveal
  const [skipReq, setSkipReq] = useState(null);           // latest skip_requests row (any status)
  const [notice, setNotice] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Per-device draft. One player per phone now, so no p1/p2 split.
  const [draft, setDraft] = useState({ page: 'answer', answer: null, prediction: null, wager: 1 });
  const patchDraft = (patch) => setDraft((prev) => ({ ...prev, ...patch }));

  // A ticking clock so the skip-waiting countdown stays fresh.
  const [, setClockTick] = useState(0);

  // Refs for change detection across reloads (new question? skip declined?)
  const roundKeyRef = useRef(null);        // `${round.id}:${skip_offset}`
  const prevSkipRef = useRef(null);
  const expireFiredRef = useRef(false);

  const loadRound = async ({ quiet = false } = {}) => {
    if (!quiet) setGameStatus('loading');
    try {
      const today = getLocalDateString();

      const { data: rpcData, error: rpcErr } = await supabase.rpc('start_todays_round', {
        p_today: today,
      });
      if (rpcErr) throw rpcErr;
      const r = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (!r) throw new Error('No round returned');

      // Detect a question change (first load, midnight, or an applied skip).
      const newKey = `${r.id}:${r.skip_offset}`;
      const questionChanged = roundKeyRef.current !== null && roundKeyRef.current !== newKey;
      const isFirstLoad = roundKeyRef.current === null;
      roundKeyRef.current = newKey;

      // Custom prompt (Author Night) content, if this round uses one.
      let custom = null;
      if (r.custom_prompt_id) {
        const { data: cp } = await supabase
          .from('custom_prompts')
          .select('id, question, options, author_id')
          .eq('id', r.custom_prompt_id)
          .single();
        custom = cp ?? null;
      }

      // Who has submitted? Read the round_progress view — never the raw
      // submissions table while the round is open (no peeking).
      const { data: progress } = await supabase
        .from('round_progress')
        .select('user_id')
        .eq('round_id', r.id);
      const submittedIds = new Set((progress ?? []).map((p) => p.user_id));

      // Full submissions only once revealed — server has scored them by then.
      let subs = null;
      if (r.status === 'revealed') {
        const { data: rows } = await supabase
          .from('submissions')
          .select('user_id, answer, prediction, wager, called_it, points')
          .eq('round_id', r.id);
        if (rows?.length === 2) {
          subs = Object.fromEntries(rows.map((row) => [row.user_id, row]));
        }
      }

      // Latest skip request for this round (any status).
      const { data: skips } = await supabase
        .from('skip_requests')
        .select('id, requested_by, status, requested_at')
        .eq('round_id', r.id)
        .order('requested_at', { ascending: false })
        .limit(1);
      const latestSkip = skips?.[0] ?? null;

      // Notices from state transitions.
      const prevSkip = prevSkipRef.current;
      if (
        prevSkip &&
        prevSkip.status === 'pending' &&
        prevSkip.requested_by === myId &&
        latestSkip?.id === prevSkip.id &&
        latestSkip.status === 'declined'
      ) {
        setNotice(`${partner.name} wants to keep this one. Answer up.`);
      }
      if (questionChanged) {
        setNotice('That question was skipped — fresh one below.');
        setDraft({ page: 'answer', answer: null, prediction: null, wager: 1 });
      }
      if (isFirstLoad) {
        setDraft({ page: 'answer', answer: null, prediction: null, wager: 1 });
      }
      prevSkipRef.current = latestSkip;
      expireFiredRef.current = false;

      setRound(r);
      setCustomPrompt(custom);
      setMySubmitted(submittedIds.has(myId));
      setPartnerSubmitted(submittedIds.has(partner.id));
      setSubmissions(subs);
      setSkipReq(latestSkip);
      setGameStatus('ready');
      setGameError(null);
    } catch (err) {
      if (!quiet) {
        setGameStatus('error');
        setGameError(err.message ?? 'Something went wrong');
      }
    }
  };

  // Load the round when entering the game.
  useEffect(() => {
    if (entered && couple.status === 'paired') {
      loadRound();
    }
    if (!entered) {
      setGameStatus('idle');
    }
  }, [entered, couple.status]);

  // Realtime: partner submitted / reveal happened / skip activity.
  useEffect(() => {
    if (!entered || !round?.id) return;
    const channel = supabase
      .channel(`round-${round.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'submissions', filter: `round_id=eq.${round.id}` },
        () => loadRound({ quiet: true })
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rounds', filter: `id=eq.${round.id}` },
        () => loadRound({ quiet: true })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'skip_requests', filter: `round_id=eq.${round.id}` },
        () => loadRound({ quiet: true })
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [entered, round?.id]);

  // Refresh when the app comes back to the foreground (async couples!).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && entered && couple.status === 'paired') {
        loadRound({ quiet: true });
      }
    });
    return () => sub.remove();
  }, [entered, couple.status]);

  // Midnight rollover + countdown ticks + skip auto-expire, every 30s.
  useEffect(() => {
    const interval = setInterval(() => {
      setClockTick((t) => t + 1);

      if (!entered || couple.status !== 'paired') return;

      // Date changed since the loaded round → fetch the new day's round.
      if (round && round.round_date !== getLocalDateString()) {
        loadRound();
        return;
      }

      // Pending skip aged past the timeout → whichever phone notices first
      // expires it (the server applies the skip; realtime updates the other).
      if (
        skipReq?.status === 'pending' &&
        !expireFiredRef.current &&
        Date.parse(skipReq.requested_at) + SKIP_TIMEOUT_MS <= Date.now()
      ) {
        expireFiredRef.current = true;
        supabase
          .rpc('resolve_skip', { p_request_id: skipReq.id, p_resolution: 'expired' })
          .then(() => loadRound({ quiet: true }));
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [entered, couple.status, round, skipReq]);

  // --- The prompt for this round ------------------------------------------------

  const prompt = useMemo(() => {
    if (!round) return null;
    if (customPrompt) {
      return {
        self: customPrompt.question,
        partner: customPrompt.question,
        reveal: customPrompt.question,
        options: customPrompt.options,
      };
    }
    if (round.prompt_index != null && PROMPTS[round.prompt_index % PROMPTS.length]) {
      return PROMPTS[round.prompt_index % PROMPTS.length];
    }
    return null;
  }, [round, customPrompt]);

  // 'redemption' | 'custom' | null — drives the badge on the answer page.
  const flavor = round?.redemption_of ? 'redemption' : round?.custom_prompt_id ? 'custom' : null;

  // --- Actions --------------------------------------------------------------------

  const lockIn = async () => {
    if (submitting || !round) return;
    // playSfx(lockSfx);
    setSubmitting(true);
    const { data, error } = await supabase.rpc('submit_answer', {
      p_round_id: round.id,
      p_answer: draft.answer,
      p_prediction: draft.prediction,
      p_wager: draft.wager,
    });
    if (error) {
      // Duplicate submit (double-tap, or raced with a reload): just resync.
      if (/duplicate|unique/i.test(error.message)) {
        await loadRound({ quiet: true });
      } else {
        setNotice(error.message);
      }
    } else {
      setMySubmitted(true);
      if (data === 'revealed') {
        await loadRound({ quiet: true });
      }
    }
    setSubmitting(false);
  };

  const requestSkip = async () => {
    if (!round) return;
    const { error } = await supabase.rpc('request_skip', { p_round_id: round.id });
    if (error && !/pending/i.test(error.message)) setNotice(error.message);
    await loadRound({ quiet: true });
  };

  const agreeToSkip = async () => {
    if (!skipReq) return;
    const { error } = await supabase.rpc('resolve_skip', {
      p_request_id: skipReq.id,
      p_resolution: 'agreed',
    });
    if (error) setNotice(error.message);
    await loadRound({ quiet: true });
  };

  const declineSkip = async () => {
    if (!skipReq) return;
    const { error } = await supabase.rpc('resolve_skip', {
      p_request_id: skipReq.id,
      p_resolution: 'declined',
    });
    if (error) setNotice(error.message);
    await loadRound({ quiet: true });
  };

  const generateInviteCode = async () => {
    if (generating) return;
    setGenerating(true);
    const { error } = await supabase.rpc('generate_invite_code');
    if (error) setNotice(error.message);
    await fetchCoupleStatus();
    setGenerating(false);
  };

  const dismissNotice = () => setNotice(null);

  const openInstagram = async () => {
    const appUrl = `instagram://user?username=${INSTAGRAM_USERNAME}`;
    const webUrl = `https://www.instagram.com/${INSTAGRAM_USERNAME}/`;
    try {
      const canOpen = await Linking.canOpenURL(appUrl);
      if (canOpen) {
        await Linking.openURL(appUrl);
      } else {
        await Linking.openURL(webUrl);
      }
    } catch {
      Linking.openURL(webUrl);
    }
  };

  if (!fontsLoaded || !authReady) {
    return (
      <View style={[styles.loading]}>
        <ActivityIndicator color={GOLD} />
      </View>
    );
  }

  // --- Route to the right page ---
  const pendingSkip = skipReq?.status === 'pending' ? skipReq : null;
  const revealed = round?.status === 'revealed' && submissions;

  let page;
  let step;
  if (!session) {
    page = <AuthPage />;
    step = -1;
  } else if (couple.status === 'loading') {
    page = (
      <View style={styles.centered}>
        <ActivityIndicator color={GOLD} />
      </View>
    );
    step = -1;
  } else if (couple.status === 'unpaired') {
    page = <PairingPage onPaired={fetchCoupleStatus} />;
    step = -1;
  } else if (couple.status === 'solo') {
    page =
      soloView === 'invite' ? (
        <SoloWaitingPage
          codes={couple.codes}
          generating={generating}
          onGenerate={generateInviteCode}
          onBack={() => setSoloView('home')}
        />
      ) : (
        <LandingPage
          me={me}
          partner={partner}
          solo
          inviteCount={couple.codes.length}
          onEnter={() => setSoloView('invite')}
        />
      );
    step = -1;
  } else if (!entered) {
    page = <LandingPage onEnter={() => setEntered(true)} me={me} partner={partner} />;
    step = -1;
  } else if (gameStatus === 'loading' || gameStatus === 'idle' || !round) {
    page = (
      <View style={styles.centered}>
        <ActivityIndicator color={GOLD} />
        <Text style={styles.debugHint}>Setting the stage…</Text>
      </View>
    );
    step = -1;
  } else if (gameStatus === 'error') {
    page = <ErrorPage message={gameError} onRetry={() => loadRound()} />;
    step = -1;
  } else if (revealed) {
    page = (
      <RevealPage
        prompt={prompt}
        me={me}
        partner={partner}
        mySub={submissions[me.id]}
        theirSub={submissions[partner.id]}
      />
    );
    step = 2;
  } else if (pendingSkip && pendingSkip.requested_by !== myId) {
    // The "notification on open": partner has a skip request waiting for me.
    page = (
      <SkipRequestPage
        prompt={prompt}
        requester={partner}
        onAgree={agreeToSkip}
        onDecline={declineSkip}
      />
    );
    step = 0;
  } else if (pendingSkip && pendingSkip.requested_by === myId) {
    page = (
      <SkipWaitingPage
        partner={partner}
        requestedAt={Date.parse(pendingSkip.requested_at)}
      />
    );
    step = 0;
  } else if (mySubmitted) {
    page = <WaitingPage me={me} partner={partner} />;
    step = 2;
  } else if (draft.page === 'predict') {
    page = (
      <PredictPage
        prompt={prompt}
        me={me}
        partner={partner}
        prediction={draft.prediction}
        wager={draft.wager}
        partnerSubmitted={partnerSubmitted}
        submitting={submitting}
        onPick={(prediction) => patchDraft({ prediction })}
        onWager={(wager) => patchDraft({ wager })}
        onBack={() => patchDraft({ page: 'answer' })}
        onLockIn={lockIn}
      />
    );
    step = 1;
  } else {
    page = (
      <AnswerPage
        prompt={prompt}
        me={me}
        partner={partner}
        flavor={flavor}
        answer={draft.answer}
        notice={notice}
        partnerSubmitted={partnerSubmitted}
        onDismissNotice={dismissNotice}
        onPick={(answer) => patchDraft({ answer })}
        onContinue={() => patchDraft({ page: 'predict' })}
        onRequestSkip={requestSkip}
      />
    );
    step = 0;
  }

  return (
    <View style={styles.root}>
      <StageBackground me={me} partner={partner} />
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        {entered && <ProgressDots step={step} accent={me.color} />}
        <ScrollView contentContainerStyle={styles.scroll}>{page}</ScrollView>
        <TouchableOpacity
          style={styles.muteChip}
          onPress={() => setMuted((m) => !m)}
          accessibilityRole="button"
          accessibilityLabel={muted ? 'Unmute sound' : 'Mute sound'}
        >
          <Text style={styles.muteChipText}>{muted ? '🔇' : '🔊'}</Text>
        </TouchableOpacity>
        {entered && (
          <TouchableOpacity
            style={styles.backChip}
            onPress={() => setEntered(false)}
            accessibilityRole="button"
            accessibilityLabel="Back to home"
          >
            <Text style={styles.backChipText}>← HOME</Text>
          </TouchableOpacity>
        )}
        {!entered && (
          <TouchableOpacity
            style={styles.igChip}
            onPress={openInstagram}
            accessibilityRole="button"
            accessibilityLabel={`Follow on Instagram, @${INSTAGRAM_USERNAME}`}
          >
            <Text style={styles.igChipLabel}>FOLLOW ME ON INSTAGRAM</Text>
            <View style={styles.igChipButton}>
              <Text style={styles.igChipHandle}>@{INSTAGRAM_USERNAME}</Text>
            </View>
          </TouchableOpacity>
        )}
      </SafeAreaView>
    </View>
  );
}
