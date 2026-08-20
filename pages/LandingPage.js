import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';
import { getLocalDateString } from '../lib/dates';
import { GOLD, LINE, DIM } from '../theme';
import { styles } from '../styles';
import { DrawnUnderline, FadeInUp, IdleFloat, Pulse } from '../components/animations';
import { SeesawButton } from '../components/chrome';

// --- Page 0: LANDING -------------------------------------------------------------------

export function LandingPage({ onEnter, me, partner, solo = false, inviteCount = 0 }) {
  // Real numbers now: weekly-season points, streak, freezes, last week's crown.
  const [board, setBoard] = useState(null);

  useEffect(() => {
    if (solo) return;
    let cancelled = false;
    supabase
      .rpc('get_scoreboard', { p_today: getLocalDateString() })
      .then(({ data }) => {
        if (!cancelled && data) setBoard(data);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pointsFor = (playerId) =>
    board?.scores?.find((s) => s.user_id === playerId)?.points ?? 0;

  const streak = board?.streak?.current ?? 0;
  const freezes = board?.streak?.freezes ?? 0;
  const lastWinnerId = board?.last_week_winner ?? null;
  const lastWinner =
    lastWinnerId === me.id ? me : lastWinnerId === partner.id ? partner : null;

  const today = new Date()
    .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    .toUpperCase()
    .replace(', ', ' · ')
    .replace(',', ' ·');

  return (
    <View style={styles.landing}>
      <View style={styles.landingCenter}>
        <FadeInUp delay={0}>
          <Pulse low={0.5}>
            <Text style={styles.landingDate}>{today}</Text>
          </Pulse>
        </FadeInUp>
        <FadeInUp delay={100}>
          <IdleFloat amplitude={-6}>
            <Text style={styles.landingTitle}>Duet</Text>
          </IdleFloat>
        </FadeInUp>
        <DrawnUnderline color={GOLD} delay={600} />
        <FadeInUp delay={450}>
          <IdleFloat phase={2} amplitude={-3}>
            <Text style={styles.landingTagline}>
              One question. Two answers.{'\n'}Who knows who better?
            </Text>
          </IdleFloat>
        </FadeInUp>

        <FadeInUp delay={650}>
          <View style={styles.statRow}>
            <View style={[styles.statPill, { borderColor: GOLD }]}>
              <Text style={styles.statPillText}>🔥 {streak} DAY STREAK</Text>
            </View>
            <View style={[styles.statPill, { borderColor: LINE }]}>
              <Text style={styles.statPillText}>
                <Text style={{ color: me.color }}>{pointsFor(me.id)}</Text>
                <Text style={{ color: DIM }}>  ·  </Text>
                <Text style={{ color: partner.color }}>{pointsFor(partner.id)}</Text>
              </Text>
            </View>
            {freezes > 0 && (
              <View style={[styles.statPill, { borderColor: LINE }]}>
                <Text style={styles.statPillText}>❄️ ×{freezes}</Text>
              </View>
            )}
          </View>
        </FadeInUp>

        {lastWinner && (
          <FadeInUp delay={720}>
            <Text style={styles.lastWeekText}>
              Last week’s champion:{' '}
              <Text style={{ color: lastWinner.color, fontFamily: 'Fraunces_600SemiBold' }}>
                {lastWinner.name} 👑
              </Text>
            </Text>
          </FadeInUp>
        )}

        <FadeInUp delay={800}>
          {solo ? (
            <View>
              <Pulse low={0.45}>
                <View style={styles.waitingChip}>
                  <Text style={styles.waitingChipText}>
                    ⏳ WAITING FOR YOUR PARTNER TO JOIN
                  </Text>
                </View>
              </Pulse>
              <SeesawButton
                label={inviteCount > 1 ? `VIEW INVITE CODES (${inviteCount})` : 'VIEW INVITE CODE'}
                onPress={onEnter}
                disabled={false}
              />
            </View>
          ) : (
            <SeesawButton label="PLAY TONIGHT'S ROUND" onPress={onEnter} disabled={false} />
          )}
        </FadeInUp>
      </View>

      <FadeInUp delay={1100}>
        <Text style={styles.landingFooter}>
          v{Constants.expoConfig?.version ?? '0.0.0'} · crafted by Brandon Rice
        </Text>
      </FadeInUp>
    </View>
  );
}
