import { Text, View } from 'react-native';
import { GOLD } from '../theme';
import { styles } from '../styles';
import { FadeInUp } from '../components/animations';
import { RevealCard, ScorePill } from '../components/game';

// --- Page 3b: THE REVEAL --------------------------------------------------------------------------

export function RevealPage({ prompt, me, partner, mySub, theirSub }) {
  // Points and verdicts were computed server-side; render them as truth.
  const mine = { ...me, ...mySub };
  const theirs = { ...partner, ...theirSub };

  const mePts = mySub?.points ?? 0;
  const themPts = theirSub?.points ?? 0;

  let headline;
  if (mePts === themPts) {
    headline = mePts > 0 ? 'Both called it. Suspicious.' : 'Nobody saw that coming.';
  } else if (mePts > themPts) {
    headline = `${mine.name} takes the night.`;
  } else {
    headline = `${theirs.name} takes the night.`;
  }

  return (
    <View>
      <FadeInUp delay={0}>
        <Text style={[styles.kicker, { color: GOLD }]}>THE REVEAL</Text>
      </FadeInUp>
      <FadeInUp delay={90}>
        <Text style={styles.question}>{prompt.reveal}</Text>
      </FadeInUp>

      <FadeInUp delay={400}>
        <RevealCard
          player={mine}
          isYou
          answer={mine.answer}
          prediction={mine.prediction}
          predictionAbout={theirs}
          calledIt={!!mine.called_it}
          points={mePts}
          wager={mine.wager ?? 1}
          tilt="-1.2deg"
          verdictDelay={900}
        />
      </FadeInUp>

      <FadeInUp delay={900}>
        <View style={styles.vsRow}>
          <View style={styles.vsLine} />
          <Text style={styles.vsText}>vs</Text>
          <View style={styles.vsLine} />
        </View>
      </FadeInUp>

      <FadeInUp delay={1200}>
        <RevealCard
          player={theirs}
          answer={theirs.answer}
          prediction={theirs.prediction}
          predictionAbout={mine}
          calledIt={!!theirs.called_it}
          points={themPts}
          wager={theirs.wager ?? 1}
          tilt="1.2deg"
          verdictDelay={1700}
        />
      </FadeInUp>

      <FadeInUp delay={2100}>
        <Text style={styles.scoreHeadline}>{headline}</Text>
      </FadeInUp>
      <FadeInUp delay={2250}>
        <View style={styles.scoreRow}>
          <ScorePill name={mine.name} color={mine.color} points={mePts} />
          <ScorePill name={theirs.name} color={theirs.color} points={themPts} />
        </View>
      </FadeInUp>

      <FadeInUp delay={2500}>
        <Text style={styles.revealFooter}>Same time tomorrow. 🌙</Text>
      </FadeInUp>
    </View>
  );
}
