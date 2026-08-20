import { Text, View } from 'react-native';
import { styles } from '../styles';
import { FadeInUp, IdleFloat, Pulse } from '../components/animations';

// --- Page 3a: WAITING --------------------------------------------------------------------------

export function WaitingPage({ me, partner }) {
  return (
    <View style={styles.centered}>
      <FadeInUp delay={0}>
        <IdleFloat amplitude={-5}>
          <View style={[styles.lockBadge, { borderColor: me.color }]}>
            <Text style={styles.lockEmoji}>🔒</Text>
          </View>
        </IdleFloat>
      </FadeInUp>
      <FadeInUp delay={140}>
        <Text style={styles.waitingTitle}>Locked in.</Text>
      </FadeInUp>
      <FadeInUp delay={260}>
        <Text style={styles.waitingSub}>
          Now we wait on{' '}
          <Text style={{ color: partner.color, fontFamily: 'Fraunces_600SemiBold' }}>
            {partner.name}
          </Text>
          .{'\n'}The reveal drops when you've both answered.
        </Text>
      </FadeInUp>
      <FadeInUp delay={500}>
        <Pulse low={0.4}>
          <Text style={styles.debugHint}>
            This screen flips the moment they answer. Go live your life. ✨
          </Text>
        </Pulse>
      </FadeInUp>
    </View>
  );
}
