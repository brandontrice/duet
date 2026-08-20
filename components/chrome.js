import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { STAGE_TOP, STAGE_BOTTOM, GOLD, CHALK } from '../theme';
import { styles } from '../styles';
import { DriftingOrb, FadeInUp } from './animations';

// --- Background: gradient stage + ambient glow lighting --------------------------

export function StageBackground({ me, partner }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={[STAGE_TOP, STAGE_BOTTOM]}
        style={StyleSheet.absoluteFill}
      />
      <DriftingOrb style={[styles.orb, styles.orbTopRight, { backgroundColor: me.color }]} duration={11000} dx={-30} dy={22} />
      <DriftingOrb style={[styles.orb, styles.orbBottomLeft, { backgroundColor: partner.color }]} duration={9000} dx={34} dy={-18} />
      <DriftingOrb style={[styles.orb, styles.orbCenterFaint, { backgroundColor: GOLD }]} duration={14000} dx={20} dy={26} />
    </View>
  );
}

// --- Chrome ------------------------------------------------------------------------

export function ProgressDots({ step, accent }) {
  return (
    <View style={styles.dotsRow}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i === step && { backgroundColor: accent, width: 22 },
          ]}
        />
      ))}
    </View>
  );
}

export function NoticeBanner({ text, onDismiss }) {
  if (!text) return null;
  return (
    <FadeInUp delay={0}>
      <TouchableOpacity
        style={styles.noticeBanner}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel={`Notice: ${text}. Tap to dismiss.`}
      >
        <Text style={styles.noticeBannerText}>{text}</Text>
        <Text style={styles.noticeBannerDismiss}>tap to dismiss</Text>
      </TouchableOpacity>
    </FadeInUp>
  );
}

// Round-flavor badge: Redemption Wednesday / Author Night Saturday.
export function FlavorBadge({ flavor }) {
  if (!flavor) return null;
  const label =
    flavor === 'redemption'
      ? '🔁 REDEMPTION ROUND · someone whiffed this one before'
      : '✍️ AUTHOR NIGHT · written by one of you';
  return (
    <FadeInUp delay={40}>
      <View style={styles.flavorBadge}>
        <Text style={styles.flavorBadgeText}>{label}</Text>
      </View>
    </FadeInUp>
  );
}

// --- Seesaw button: rocks forever; white flash waiting, gold flash when armed ------

export function SeesawButton({ label, onPress, disabled }) {
  const rock = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const rockLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(rock, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(rock, { toValue: -1, duration: 900, useNativeDriver: true }),
      ])
    );
    rockLoop.start();

    const flashLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(flash, { toValue: 1, duration: 1100, useNativeDriver: false }),
        Animated.timing(flash, { toValue: 0, duration: 1100, useNativeDriver: false }),
      ])
    );
    flashLoop.start();

    return () => {
      rockLoop.stop();
      flashLoop.stop();
    };
  }, []);

  return (
    <Animated.View
      style={{
        transform: [
          {
            rotate: rock.interpolate({
              inputRange: [-1, 1],
              outputRange: ['-2deg', '2deg'],
            }),
          },
        ],
      }}
    >
      <Animated.View
        style={{
          borderRadius: 16,
          backgroundColor: flash.interpolate({
            inputRange: [0, 1],
            outputRange: disabled
              ? ['rgba(255,255,255,0.055)', 'rgba(255,255,255,0.28)']
              : ['rgba(255,200,74,1)', 'rgba(255,224,138,1)'],
          }),
        }}
      >
        <TouchableOpacity
          style={[
            styles.primaryButton,
            { backgroundColor: 'transparent' },
            disabled && styles.primaryButtonDisabled,
            disabled && { backgroundColor: 'transparent' },
          ]}
          disabled={disabled}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled: !!disabled }}
        >
          <Text style={[styles.primaryButtonText, disabled && { color: CHALK }]}>
            {label}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}
