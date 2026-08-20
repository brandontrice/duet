import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { GOLD, DIM } from '../theme';
import { styles } from '../styles';
import { DrawnUnderline, FadeInUp } from '../components/animations';
import { SeesawButton } from '../components/chrome';

// --- Page -0.5: PAIRING ---------------------------------------------------------------

export function PairingPage({ onPaired }) {
  const [displayName, setDisplayName] = useState('');
  const [joinMode, setJoinMode] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const createCouple = async () => {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('create_couple', {
      p_display_name: displayName.trim(),
    });
    if (err) setError(err.message);
    else onPaired();
    setBusy(false);
  };

  const joinCouple = async () => {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('join_couple', {
      p_invite_code: code.trim(),
      p_display_name: displayName.trim(),
    });
    if (err) setError(err.message);
    else onPaired();
    setBusy(false);
  };

  return (
    <View style={styles.landing}>
      <View style={styles.landingCenter}>
        <FadeInUp delay={0}>
          <Text style={styles.landingTitle}>Duet</Text>
        </FadeInUp>
        <DrawnUnderline color={GOLD} delay={400} />
        <FadeInUp delay={250}>
          <Text style={styles.landingTagline}>
            {joinMode ? 'Enter the code your partner sent you.' : 'It takes two.\nLink up with your partner.'}
          </Text>
        </FadeInUp>

        <FadeInUp delay={400}>
          <TextInput
            style={styles.authInput}
            placeholder="your first name"
            placeholderTextColor={DIM}
            value={displayName}
            onChangeText={setDisplayName}
            accessibilityLabel="Your first name"
          />
          {joinMode && (
            <TextInput
              style={[styles.authInput, styles.codeInput]}
              placeholder="ABC123"
              placeholderTextColor={DIM}
              autoCapitalize="characters"
              maxLength={6}
              value={code}
              onChangeText={setCode}
              accessibilityLabel="Invite code"
            />
          )}
        </FadeInUp>

        {error && (
          <FadeInUp delay={0}>
            <Text style={styles.authError}>{error}</Text>
          </FadeInUp>
        )}

        <FadeInUp delay={520}>
          <SeesawButton
            label={busy ? 'ONE MOMENT…' : joinMode ? 'JOIN OUR DUET' : 'START OUR DUET'}
            disabled={busy || !displayName.trim() || (joinMode && code.trim().length < 6)}
            onPress={joinMode ? joinCouple : createCouple}
          />
        </FadeInUp>

        <FadeInUp delay={650}>
          <TouchableOpacity
            style={styles.backLink}
            onPress={() => setJoinMode((m) => !m)}
            accessibilityRole="button"
            accessibilityLabel={joinMode ? 'Start a new Duet instead' : 'Have a code? Join your partner'}
          >
            <Text style={styles.backLinkText}>
              {joinMode ? '← Start a new Duet instead' : 'Have a code? Join your partner'}
            </Text>
          </TouchableOpacity>
        </FadeInUp>
      </View>
    </View>
  );
}
