import { Text, TouchableOpacity, View } from 'react-native';
import { GOLD } from '../theme';
import { styles } from '../styles';
import { DrawnUnderline, FadeInUp } from '../components/animations';
import { SeesawButton } from '../components/chrome';

// What the partner sees when they open the app with a skip pending.
export function SkipRequestPage({ prompt, requester, onAgree, onDecline }) {
  return (
    <View style={styles.answerPage}>
      <FadeInUp delay={0}>
        <Text style={[styles.kicker, { color: GOLD }]}>SKIP REQUEST</Text>
      </FadeInUp>
      <FadeInUp delay={90}>
        <Text style={styles.question}>
          <Text style={[styles.questionItalic, { color: requester.color }]}>
            {requester.name}
          </Text>{' '}
          wants to skip tonight's question. Do you agree?
        </Text>
      </FadeInUp>
      <DrawnUnderline color={GOLD} delay={420} />

      <FadeInUp delay={250}>
        <View style={styles.skipQuestionCard}>
          <Text style={styles.skipQuestionLabel}>TONIGHT'S QUESTION</Text>
          <Text style={styles.skipQuestionText}>{prompt.reveal}</Text>
        </View>
      </FadeInUp>

      <FadeInUp delay={450}>
        <SeesawButton label="YES — SKIP IT" onPress={onAgree} disabled={false} />
      </FadeInUp>

      <FadeInUp delay={600}>
        <TouchableOpacity
          style={styles.declineButton}
          onPress={onDecline}
          accessibilityRole="button"
          accessibilityLabel="No, let's answer it"
        >
          <Text style={styles.declineButtonText}>NO — LET'S ANSWER IT</Text>
        </TouchableOpacity>
      </FadeInUp>
    </View>
  );
}
