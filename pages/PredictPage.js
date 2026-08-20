import { Text, TouchableOpacity, View } from 'react-native';
import { wagerWin } from '../theme';
import { styles } from '../styles';
import { DrawnUnderline, FadeInUp } from '../components/animations';
import { SeesawButton } from '../components/chrome';
import { OptionGroup, WagerSelector } from '../components/game';

// --- Page 2: CALL IT --------------------------------------------------------------------

export function PredictPage({ prompt, me, partner, prediction, wager, partnerSubmitted, submitting, onPick, onWager, onBack, onLockIn }) {
  return (
    <View style={styles.answerPage}>
      <FadeInUp delay={0}>
        <Text style={[styles.kicker, { color: partner.color }]}>CALL IT</Text>
      </FadeInUp>
      <FadeInUp delay={90}>
        <Text style={styles.question}>{prompt.partner}</Text>
      </FadeInUp>
      <DrawnUnderline color={partner.color} delay={420} />

      <OptionGroup
        options={prompt.options}
        selected={prediction}
        onSelect={onPick}
      />

      {prediction && (
        <FadeInUp delay={0}>
          <WagerSelector wager={wager} onWager={onWager} accent={partner.color} />
        </FadeInUp>
      )}

      {partnerSubmitted && (
        <FadeInUp delay={0}>
          <Text style={styles.partnerLockedHint}>
            <Text style={{ color: partner.color }}>{partner.name}</Text> already locked in. 👀
          </Text>
        </FadeInUp>
      )}

      <FadeInUp delay={520}>
        <SeesawButton
          label={
            submitting
              ? 'LOCKING IN…'
              : !prediction
              ? 'MAKE YOUR CALL'
              : wager === 1
              ? 'LOCK IT IN'
              : `LOCK IT IN · ${wagerWin(wager)} ON THE LINE`
          }
          disabled={!prediction || submitting}
          onPress={onLockIn}
        />
      </FadeInUp>

      <FadeInUp delay={650}>
        <TouchableOpacity
          style={styles.backLink}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Change my answer"
        >
          <Text style={styles.backLinkText}>← Change my answer</Text>
        </TouchableOpacity>
      </FadeInUp>
    </View>
  );
}
