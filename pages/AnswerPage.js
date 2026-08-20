import { Text, TouchableOpacity, View } from 'react-native';
import { styles } from '../styles';
import { DrawnUnderline, FadeInUp } from '../components/animations';
import { NoticeBanner, FlavorBadge, SeesawButton } from '../components/chrome';
import { OptionGroup } from '../components/game';

// --- Page 1: YOUR ANSWER --------------------------------------------------------------

export function AnswerPage({ prompt, me, partner, flavor, answer, notice, partnerSubmitted, onDismissNotice, onPick, onContinue, onRequestSkip }) {
  return (
    <View style={styles.answerPage}>
      <NoticeBanner text={notice} onDismiss={onDismissNotice} />
      <FlavorBadge flavor={flavor} />
      <FadeInUp delay={0}>
        <Text style={[styles.kicker, { color: me.color }]}>YOUR ANSWER</Text>
      </FadeInUp>
      <FadeInUp delay={90}>
        <Text style={styles.question}>{prompt.self}</Text>
      </FadeInUp>
      <DrawnUnderline color={me.color} delay={420} />

      <OptionGroup
        options={prompt.options}
        selected={answer}
        onSelect={onPick}
      />

      {partnerSubmitted && (
        <FadeInUp delay={0}>
          <Text style={styles.partnerLockedHint}>
            <Text style={{ color: partner.color }}>{partner.name}</Text> already locked in. 👀
          </Text>
        </FadeInUp>
      )}

      <FadeInUp delay={520}>
        <SeesawButton
          label={answer ? 'CONTINUE' : 'PICK ONE TO CONTINUE'}
          disabled={!answer}
          onPress={onContinue}
        />
      </FadeInUp>

      <FadeInUp delay={650}>
        <TouchableOpacity
          style={styles.backLink}
          onPress={onRequestSkip}
          accessibilityRole="button"
          accessibilityLabel="Skip this question"
        >
          <Text style={styles.backLinkText}>Skip this question →</Text>
        </TouchableOpacity>
      </FadeInUp>
    </View>
  );
}
