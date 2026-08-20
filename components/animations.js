import { useEffect, useRef } from 'react';
import { Animated, TouchableOpacity } from 'react-native';

// --- Animation components ------------------------------------------------------------

export function FadeInUp({ delay = 0, children, style }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 420,
      delay,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [14, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function IdleFloat({ children, phase = 0, amplitude = -4 }) {
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 2200, useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 2200, useNativeDriver: true }),
      ])
    );
    const timer = setTimeout(() => loop.start(), 1000 + phase * 300);
    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, []);

  return (
    <Animated.View
      style={{
        transform: [
          {
            translateY: bob.interpolate({
              inputRange: [0, 1],
              outputRange: [0, amplitude],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

export function Pulse({ children, low = 0.55 }) {
  const breath = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: low, duration: 1600, useNativeDriver: true }),
        Animated.timing(breath, { toValue: 1, duration: 1600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return <Animated.View style={{ opacity: breath }}>{children}</Animated.View>;
}

export function StampIn({ children, delay = 0 }) {
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      scale.setValue(1.7);
      Animated.spring(scale, {
        toValue: 1,
        friction: 5,
        tension: 220,
        useNativeDriver: true,
      }).start();
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View
      style={{
        opacity: scale.interpolate({
          inputRange: [0, 1, 1.7],
          outputRange: [0, 1, 0.9],
        }),
        transform: [{ scale }],
      }}
    >
      {children}
    </Animated.View>
  );
}

export function Wiggle({ children, phase = 0 }) {
  const angle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(2000),
        Animated.timing(angle, { toValue: 1, duration: 70, useNativeDriver: true }),
        Animated.timing(angle, { toValue: -1, duration: 70, useNativeDriver: true }),
        Animated.timing(angle, { toValue: 0.6, duration: 70, useNativeDriver: true }),
        Animated.timing(angle, { toValue: 0, duration: 70, useNativeDriver: true }),
      ])
    );
    const timer = setTimeout(() => loop.start(), phase * 250);
    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, []);

  return (
    <Animated.View
      style={{
        transform: [
          {
            rotate: angle.interpolate({
              inputRange: [-1, 1],
              outputRange: ['-1.6deg', '1.6deg'],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

export function DriftingOrb({ style, duration = 9000, dx = 26, dy = 18 }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration, useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <Animated.View
      style={[
        style,
        {
          transform: [
            { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
            { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
          ],
        },
      ]}
    />
  );
}

export function Shimmer({ children }) {
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <Animated.View
      style={{ opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }) }}
    >
      {children}
    </Animated.View>
  );
}

export function PressScale({ onPress, style, children, disabled, accessibilityLabel, accessibilityRole = 'button' }) {
  const scale = useRef(new Animated.Value(1)).current;
  const down = () =>
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40 }).start();
  const up = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4 }).start();
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      disabled={disabled}
      onPressIn={down}
      onPressOut={up}
      onPress={onPress}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </TouchableOpacity>
  );
}

export function DrawnUnderline({ color, delay = 0 }) {
  const draw = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(draw, {
      toValue: 1,
      duration: 500,
      delay,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View
      style={{
        height: 4,
        width: 76,
        borderRadius: 2,
        backgroundColor: color,
        alignSelf: 'center',
        marginTop: -12,
        marginBottom: 24,
        transform: [{ scaleX: draw }],
      }}
    />
  );
}
