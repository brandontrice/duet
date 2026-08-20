import { Text, TouchableOpacity, View } from 'react-native';
import {
  GOLD,
  SELECT_GREEN,
  SELECT_GREEN_TINT,
  MISS_RED,
  MISS_RED_SOFT,
  STAGE_BOTTOM,
  DIM,
  LINE,
} from '../theme';
import { styles } from '../styles';
import { FadeInUp, PressScale, StampIn, Wiggle } from './animations';

// --- Shared option list --------------------------------------------------------------------

export function OptionGroup({ options, selected, onSelect }) {
  return (
    <View style={styles.optionGroup}>
      {options.map((option, index) => {
        const isSelected = selected === option;
        return (
          <FadeInUp key={option} delay={200 + index * 80}>
            <Wiggle phase={index}>
              <PressScale
                onPress={() => onSelect(option)}
                accessibilityLabel={option}
                accessibilityState={{ selected: isSelected }}
                style={[
                  styles.option,
                  isSelected && {
                    borderColor: SELECT_GREEN,
                    backgroundColor: SELECT_GREEN_TINT,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    isSelected && {
                      color: SELECT_GREEN,
                      fontFamily: 'Fraunces_900Black',
                    },
                  ]}
                >
                  {option}
                </Text>
              </PressScale>
            </Wiggle>
          </FadeInUp>
        );
      })}
    </View>
  );
}

// The confidence wager: 1–3 stake picked before the reveal.
const WAGER_LEVELS = [
  { value: 1, label: '×1', caption: 'a hunch' },
  { value: 2, label: '×2', caption: 'pretty sure' },
  { value: 3, label: '×3', caption: 'CERTAIN' },
];

export function WagerSelector({ wager, onWager, accent }) {
  return (
    <View style={styles.wagerBlock}>
      <Text style={styles.wagerLabel}>HOW SURE ARE YOU?</Text>
      <View style={styles.wagerRow}>
        {WAGER_LEVELS.map(({ value, label, caption }) => {
          const active = wager === value;
          return (
            <TouchableOpacity
              key={value}
              onPress={() => onWager(value)}
              accessibilityRole="button"
              accessibilityLabel={`Wager ${label}, ${caption}`}
              accessibilityState={{ selected: active }}
              style={[
                styles.wagerChip,
                active && { borderColor: GOLD, backgroundColor: 'rgba(255,200,74,0.14)' },
              ]}
            >
              <Text style={[styles.wagerChipValue, active && { color: GOLD }]}>{label}</Text>
              <Text style={[styles.wagerChipCaption, active && { color: GOLD }]}>{caption}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.wagerHint}>
        {wager === 1 && 'Safe call. Win 10, lose nothing.'}
        {wager === 2 && 'Win 20 — but a miss costs 10.'}
        {wager === 3 && 'Win 30 — but a miss costs 20. No takebacks.'}
      </Text>
    </View>
  );
}

export function RevealCard({ player, isYou, answer, prediction, predictionAbout, calledIt, points, wager, tilt, verdictDelay = 0 }) {
  let verdictText;
  if (calledIt) {
    verdictText = wager === 3 ? `🎯 DEAD CERTAIN +${points}` : `🎯 CALLED IT +${points}`;
  } else if (wager === 3) {
    verdictText = `YOU WERE SO SURE. ${points}`;
  } else if (wager === 2) {
    verdictText = `CONFIDENT. WRONG. ${points}`;
  } else {
    verdictText = 'NOT EVEN CLOSE';
  }

  return (
    <View style={[styles.revealCard, { borderColor: player.color, transform: [{ rotate: tilt }] }]}>
      <View style={[styles.revealNameTag, { backgroundColor: player.color }]}>
        <Text style={styles.revealNameText}>
          {player.name.toUpperCase()}
          {isYou ? ' · YOU' : ''}
        </Text>
      </View>

      <Text style={styles.revealAnswerLabel}>SAID</Text>
      <Text style={[styles.revealAnswer, { color: player.color }]}>“{answer}”</Text>

      <Text style={styles.revealPrediction}>
        Called{' '}
        <Text style={{ color: predictionAbout.color, fontFamily: 'Fraunces_600SemiBold' }}>
          “{prediction}”
        </Text>{' '}
        for {predictionAbout.name}
        {wager > 1 && <Text style={{ color: GOLD }}>  ·  staked ×{wager}</Text>}
      </Text>

      <StampIn delay={verdictDelay}>
        <View
          style={[
            styles.verdict,
            calledIt
              ? { backgroundColor: GOLD }
              : wager === 3
              ? { backgroundColor: 'rgba(255,93,115,0.22)', borderWidth: 1, borderColor: MISS_RED }
              : { borderWidth: 1, borderColor: LINE },
          ]}
        >
          <Text
            style={[
              styles.verdictText,
              { color: calledIt ? STAGE_BOTTOM : wager === 3 ? MISS_RED_SOFT : DIM },
            ]}
          >
            {verdictText}
          </Text>
        </View>
      </StampIn>
    </View>
  );
}

export function ScorePill({ name, color, points }) {
  return (
    <View style={[styles.scorePill, { borderColor: color }]}>
      <Text style={[styles.scorePillName, { color }]}>{name}</Text>
      <Text style={styles.scorePillPoints}>{points > 0 ? `+${points}` : points}</Text>
    </View>
  );
}
