import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { GOLD, DIM } from '../theme';
import { styles } from '../styles';
import { DrawnUnderline, FadeInUp } from '../components/animations';
import { SeesawButton } from '../components/chrome';

// --- Page -1: SIGN IN --------------------------------------------------------------------

export function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);

    if (mode === 'signin') {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) setError(err.message);
      // On success, onAuthStateChange fires and the app routes in.
    } else {
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (err) {
        setError(err.message);
      } else if (data.session) {
        // Auto-confirm is on: we're signed in; the app routes in by itself.
      } else {
        // Account created but no session (email confirmation pending).
        setInfo('Account created! Sign in below.');
        setMode('signin');
        setPassword('');
      }
    }
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
            {mode === 'signin' ? 'Welcome back.' : 'Create your account.'}
          </Text>
        </FadeInUp>

        <FadeInUp delay={400}>
          <TextInput
            style={styles.authInput}
            placeholder="email"
            placeholderTextColor={DIM}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            accessibilityLabel="Email"
          />
          <TextInput
            style={styles.authInput}
            placeholder="password"
            placeholderTextColor={DIM}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            accessibilityLabel="Password"
          />
        </FadeInUp>

        {info && (
          <FadeInUp delay={0}>
            <Text style={styles.authInfo}>{info}</Text>
          </FadeInUp>
        )}
        {error && (
          <FadeInUp delay={0}>
            <Text style={styles.authError}>{error}</Text>
          </FadeInUp>
        )}

        <FadeInUp delay={520}>
          <SeesawButton
            label={busy ? 'ONE MOMENT…' : mode === 'signin' ? 'SIGN IN' : 'SIGN UP'}
            disabled={busy || !email || !password}
            onPress={submit}
          />
        </FadeInUp>

        <FadeInUp delay={650}>
          <TouchableOpacity
            style={styles.backLink}
            onPress={() => setMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
            accessibilityRole="button"
            accessibilityLabel={mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
          >
            <Text style={styles.backLinkText}>
              {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
            </Text>
          </TouchableOpacity>
        </FadeInUp>
      </View>
    </View>
  );
}
