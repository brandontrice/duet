import { Text, TouchableOpacity, View } from 'react-native';
import { styles } from '../styles';
import { FadeInUp } from '../components/animations';

// --- Error page --------------------------------------------------------------------

export function ErrorPage({ message, onRetry }) {
  return (
    <View style={styles.centered}>
      <FadeInUp delay={0}>
        <Text style={styles.waitingTitle}>Hit a wrong note.</Text>
      </FadeInUp>
      <FadeInUp delay={140}>
        <Text style={styles.waitingSub}>{message ?? 'Something went wrong.'}</Text>
      </FadeInUp>
      <FadeInUp delay={300}>
        <TouchableOpacity
          style={styles.shareButton}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text style={styles.shareButtonText}>TRY AGAIN</Text>
        </TouchableOpacity>
      </FadeInUp>
    </View>
  );
}
