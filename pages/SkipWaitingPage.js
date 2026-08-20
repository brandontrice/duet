import { Text, View } from 'react-native';
import { GOLD, SKIP_TIMEOUT_MS } from '../theme';
import { styles } from '../styles';
import { FadeInUp, IdleFloat } from '../components/animations';

// --- SKIP FLOW PAGES -------------------------------------------------------------------------

// The requester's holding pattern while their partner decides.
export function SkipWaitingPage({ partner, requestedAt }) {
  const remainingMs = Math.max(0, requestedAt + SKIP_TIMEOUT_MS - Date.now());
  const hours = Math.floor(remainingMs / 3600000);
  const minutes = Math.ceil((remainingMs % 3600000) / 60000);

  return (
    <View style={styles.centered}>
      <FadeInUp delay={0}>
        <IdleFloat amplitude={-5}>
          <View style={[styles.lockBadge, { borderColor: GOLD }]}>
            <Text style={styles.lockEmoji}>⏳</Text>
          </View>
        </IdleFloat>
      </FadeInUp>
      <FadeInUp delay={140}>
        <Text style={styles.waitingTitle}>Skip requested.</Text>
      </FadeInUp>
      <FadeInUp delay={260}>
        <Text style={styles.waitingSub}>
          Waiting on{' '}
          <Text style={{ color: partner.color, fontFamily: 'Fraunces_600SemiBold' }}>
            {partner.name}
          </Text>{' '}
          to agree.{'\n'}If there's no response within 6 hours, tonight's
          question will be skipped automatically.
        </Text>
      </FadeInUp>
      <FadeInUp delay={420}>
        <Text style={styles.debugHint}>
          Auto-skips in about {hours}h {minutes}m
        </Text>
      </FadeInUp>
    </View>
  );
}
