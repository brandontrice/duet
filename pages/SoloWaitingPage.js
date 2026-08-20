import { Share, Text, TouchableOpacity, View } from 'react-native';
import { GOLD } from '../theme';
import { styles } from '../styles';
import { FadeInUp, IdleFloat, Shimmer } from '../components/animations';

export function SoloWaitingPage({ codes, generating, onGenerate, onBack }) {
  const shareCode = (code) => {
    Share.share({ message: `Join me on Duet! Our invite code is ${code}` });
  };

  return (
    <View style={styles.centered}>
      <FadeInUp delay={0}>
        <Text style={[styles.kicker, { color: GOLD }]}>
          {codes.length > 1 ? 'YOUR INVITE CODES' : 'YOUR INVITE CODE'}
        </Text>
      </FadeInUp>

      {codes.map((c, i) => (
        <FadeInUp key={c.code} delay={120 + i * 100}>
          <IdleFloat phase={i} amplitude={-4}>
            <TouchableOpacity
              style={styles.codeCard}
              onPress={() => shareCode(c.code)}
              accessibilityRole="button"
              accessibilityLabel={`Invite code ${c.code}. Tap to share.`}
            >
              <Shimmer>
                <Text style={styles.codeCardText}>{c.code}</Text>
              </Shimmer>
              <Text style={styles.codeCardHint}>tap to share</Text>
            </TouchableOpacity>
          </IdleFloat>
        </FadeInUp>
      ))}

      <FadeInUp delay={300}>
        <Text style={styles.waitingSub}>
          Each code opens the same duet.{'\n'}First one to join is your partner — the rest expire.
        </Text>
      </FadeInUp>

      <FadeInUp delay={430}>
        <TouchableOpacity
          style={[styles.shareButton, generating && { opacity: 0.5 }]}
          onPress={onGenerate}
          disabled={generating}
          accessibilityRole="button"
          accessibilityLabel={generating ? 'Generating new code' : 'Generate new code'}
          accessibilityState={{ disabled: generating }}
        >
          <Text style={styles.shareButtonText}>
            {generating ? 'GENERATING…' : '+ NEW CODE'}
          </Text>
        </TouchableOpacity>
      </FadeInUp>

      <FadeInUp delay={550}>
        <TouchableOpacity
          style={styles.backLink}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back to home"
        >
          <Text style={styles.backLinkText}>← Back to home</Text>
        </TouchableOpacity>
      </FadeInUp>
    </View>
  );
}
