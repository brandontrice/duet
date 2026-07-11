import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Linking,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import { useAudioPlayer } from 'expo-audio';
import {
  useFonts,
  Fraunces_400Regular,
  Fraunces_600SemiBold,
  Fraunces_900Black,
  Fraunces_900Black_Italic,
} from '@expo-google-fonts/fraunces';

// ---------------------------------------------------------------------------
// PHASE 1.4 — the prompt library + daily question + skip flow.
//   • 50 prompts, each with self / partner / reveal phrasings
//   • One question per day, picked deterministically from the local date,
//     so both phones land on the same question. Rolls over at midnight.
//   • Skip flow: requester → waiting screen (6h auto-skip) → partner gets
//     an agree/decline prompt on open → agree skips to the next question,
//     decline sends the requester back to answer up.
// Still local-state simulation via the debug toggle until Phase 2 (Supabase).
// ---------------------------------------------------------------------------

// --- Theme -------------------------------------------------------------------

const STAGE_TOP = '#1c1140';
const STAGE_BOTTOM = '#120b28';
const RAISED = 'rgba(255,255,255,0.055)';
const LINE = 'rgba(255,255,255,0.14)';
const CHALK = '#f7f3ff';
const DIM = '#a89dcf';
const GOLD = '#ffc84a';
const SELECT_GREEN = '#4ade80';
const SELECT_GREEN_TINT = 'rgba(74,222,128,0.16)';

const INSTAGRAM_USERNAME = 'brandonricey';

const PLAYERS = {
  p1: { id: 'p1', name: 'Brandon', color: '#ff5d73', tint: 'rgba(255,93,115,0.18)' },
  p2: { id: 'p2', name: 'Partner', color: '#3fd8c7', tint: 'rgba(63,216,199,0.18)' },
};

const POINTS_FOR_CORRECT_PREDICTION = 10;

// Skip request auto-resolves after this long with no partner response.
// (Drop this to 60000 — one minute — to test the auto-skip without waiting 6 hours.)
const SKIP_TIMEOUT_MS = 6 * 60 * 60 * 1000;

// --- The prompt library ---------------------------------------------------------
// Every prompt is three sentences + shared options:
//   self:    asked to the player about themselves
//   partner: asked to the player about their partner (used when predicting)
//   reveal:  neutral framing for the reveal screen

const PROMPTS = [
  {
    self: 'Which chore do you secretly hate the most?',
    partner: 'Which chore does your partner secretly hate the most?',
    reveal: 'The chore each of you secretly hates the most.',
    options: ['Dishes', 'Laundry', 'Vacuuming', 'Taking out the trash'],
  },
  {
    self: 'What’s your go-to comfort food?',
    partner: 'What’s your partner’s go-to comfort food?',
    reveal: 'Each of your go-to comfort foods.',
    options: ['Pizza', 'Mac & cheese', 'Ice cream', 'Tacos'],
  },
  {
    self: 'What’s your dream vacation vibe?',
    partner: 'What’s your partner’s dream vacation vibe?',
    reveal: 'Each of your dream vacation vibes.',
    options: ['Beach resort', 'Mountain cabin', 'Big city', 'Road trip'],
  },
  {
    self: 'What do you always want to watch on a weeknight?',
    partner: 'What does your partner always want to watch on a weeknight?',
    reveal: 'What each of you always wants to watch.',
    options: ['Comedy', 'True crime', 'Reality TV', 'Sports'],
  },
  {
    self: 'What’s your ideal Friday night?',
    partner: 'What’s your partner’s ideal Friday night?',
    reveal: 'Each of your ideal Friday nights.',
    options: ['Night out', 'Movie at home', 'Dinner with friends', 'Asleep by 9'],
  },
  {
    self: 'Which app eats most of your screen time?',
    partner: 'Which app eats most of your partner’s screen time?',
    reveal: 'The app eating each of your screen time.',
    options: ['Instagram', 'TikTok', 'YouTube', 'Messages'],
  },
  {
    self: 'What’s your caffeine personality?',
    partner: 'What’s your partner’s caffeine personality?',
    reveal: 'Each of your caffeine personalities.',
    options: ['Black coffee', 'Sweet latte', 'Energy drink', 'Tea person'],
  },
  {
    self: 'What’s your role in the kitchen?',
    partner: 'What’s your partner’s role in the kitchen?',
    reveal: 'Each of your kitchen roles.',
    options: ['Head chef', 'Sous chef', 'Taste tester', 'Cleanup crew'],
  },
  {
    self: 'Which home habit bugs you the most?',
    partner: 'Which home habit bugs your partner the most?',
    reveal: 'The home habit that bugs each of you most.',
    options: ['Dishes in the sink', 'Lights left on', 'Clothes on the floor', 'Loud chewing'],
  },
  {
    self: 'What’s your guilty pleasure music?',
    partner: 'What’s your partner’s guilty pleasure music?',
    reveal: 'Each of your guilty pleasure genres.',
    options: ['2000s pop', 'Country', 'Boy bands', 'Show tunes'],
  },
  {
    self: 'What’s your sleep style?',
    partner: 'What’s your partner’s sleep style?',
    reveal: 'Each of your sleep styles.',
    options: ['Blanket thief', 'Starfish', 'Cuddler', 'Doesn’t move all night'],
  },
  {
    self: 'What do you splurge on without guilt?',
    partner: 'What does your partner splurge on without guilt?',
    reveal: 'What each of you splurges on.',
    options: ['Food', 'Clothes', 'Gadgets', 'Experiences'],
  },
  {
    self: 'What’s your perfect breakfast?',
    partner: 'What’s your partner’s perfect breakfast?',
    reveal: 'Each of your perfect breakfasts.',
    options: ['Pancakes', 'Eggs & bacon', 'Just coffee', 'Cereal at any hour'],
  },
  {
    self: 'Who are you at a party?',
    partner: 'Who is your partner at a party?',
    reveal: 'Who each of you becomes at a party.',
    options: ['Social butterfly', 'Guarding the snack table', 'One deep conversation', 'First to leave'],
  },
  {
    self: 'What’s your role on a car ride?',
    partner: 'What’s your partner’s role on a car ride?',
    reveal: 'Each of your car ride roles.',
    options: ['The DJ', 'The navigator', 'Asleep in 10 minutes', 'Snack manager'],
  },
  {
    self: 'How do you handle a stressful day?',
    partner: 'How does your partner handle a stressful day?',
    reveal: 'How each of you handles stress.',
    options: ['Clean everything', 'Go quiet', 'Vent it out', 'Stress snacks'],
  },
  {
    self: 'What’s your ideal weekend morning?',
    partner: 'What’s your partner’s ideal weekend morning?',
    reveal: 'Each of your ideal weekend mornings.',
    options: ['Sleep in forever', 'Early workout', 'Big breakfast', 'Knock out errands'],
  },
  {
    self: 'How do you handle scary movies?',
    partner: 'How does your partner handle scary movies?',
    reveal: 'How each of you handles scary movies.',
    options: ['Loves them', 'Hides behind a pillow', 'Talks the whole time', 'Refuses to watch'],
  },
  {
    self: 'What’s your ice cream order?',
    partner: 'What’s your partner’s ice cream order?',
    reveal: 'Each of your ice cream orders.',
    options: ['Chocolate', 'Vanilla', 'Cookie dough', 'Mint chip'],
  },
  {
    self: 'Which superpower would you pick?',
    partner: 'Which superpower would your partner pick?',
    reveal: 'The superpower each of you would pick.',
    options: ['Flying', 'Invisibility', 'Reading minds', 'Time travel'],
  },
  {
    self: 'How do you order at a restaurant?',
    partner: 'How does your partner order at a restaurant?',
    reveal: 'How each of you orders at a restaurant.',
    options: ['Same thing every time', 'Something new every time', 'Asks the server', 'Copies whatever I get'],
  },
  {
    self: 'What’s your texting style?',
    partner: 'What’s your partner’s texting style?',
    reveal: 'Each of your texting styles.',
    options: ['Instant replies', 'Hours later', 'All emojis', 'Sends voice memos'],
  },
  {
    self: 'Who are you on game night?',
    partner: 'Who is your partner on game night?',
    reveal: 'Who each of you becomes on game night.',
    options: ['Ultra competitive', 'The rule enforcer', 'Just here for fun', 'Sore loser'],
  },
  {
    self: 'What are you always late for?',
    partner: 'What is your partner always late for?',
    reveal: 'What each of you is always late for.',
    options: ['Everything', 'Nothing, ever', 'Only work stuff', 'Only fun stuff'],
  },
  {
    self: 'What’s your ideal house temperature?',
    partner: 'What’s your partner’s ideal house temperature?',
    reveal: 'Each of your thermostat truths.',
    options: ['Freezing cold', 'Toasty warm', 'Windows open', 'Whatever wins the fight'],
  },
  {
    self: 'What’s your hidden talent category?',
    partner: 'What’s your partner’s hidden talent category?',
    reveal: 'Each of your hidden talents.',
    options: ['Cooking', 'Music', 'Random trivia', 'Impressions'],
  },
  {
    self: 'What’s your grocery store habit?',
    partner: 'What’s your partner’s grocery store habit?',
    reveal: 'Each of your grocery store habits.',
    options: ['Sticks to the list', 'Impulse buys', 'Forgets the main thing', 'Snack aisle detour'],
  },
  {
    self: 'How do you feel about Sundays?',
    partner: 'How does your partner feel about Sundays?',
    reveal: 'How each of you feels about Sundays.',
    options: ['Sunday scaries', 'Favorite day', 'Meal prep mode', 'Pretends Monday isn’t real'],
  },
  {
    self: 'What’s your karaoke move?',
    partner: 'What’s your partner’s karaoke move?',
    reveal: 'Each of your karaoke moves.',
    options: ['90s R&B', 'Rock anthem', 'Country ballad', 'Absolutely not singing'],
  },
  {
    self: 'What’s your phone battery lifestyle?',
    partner: 'What’s your partner’s phone battery lifestyle?',
    reveal: 'Each of your battery lifestyles.',
    options: ['Always at 100%', 'Always dying', 'Panic charges at 50%', 'Lives in the red'],
  },
  {
    self: 'What makes you tear up?',
    partner: 'What makes your partner tear up?',
    reveal: 'What makes each of you tear up.',
    options: ['Movies', 'Commercials', 'Certain songs', 'Nothing, allegedly'],
  },
  {
    self: 'What’s your fast food weakness?',
    partner: 'What’s your partner’s fast food weakness?',
    reveal: 'Each of your fast food weaknesses.',
    options: ['Chicken sandwich', 'Fries', 'Tacos', 'Milkshake'],
  },
  {
    self: 'What’s your amusement park move?',
    partner: 'What’s your partner’s amusement park move?',
    reveal: 'Each of your amusement park moves.',
    options: ['Biggest coaster first', 'Snacks all day', 'Winning carnival games', 'Holding the bags'],
  },
  {
    self: 'Which reality show would you survive longest on?',
    partner: 'Which reality show would your partner survive longest on?',
    reveal: 'The reality show each of you would survive.',
    options: ['Survivor', 'The Bachelor', 'Big Brother', 'A cooking show'],
  },
  {
    self: 'What’s your favorite kind of weather?',
    partner: 'What’s your partner’s favorite kind of weather?',
    reveal: 'Each of your favorite weather.',
    options: ['Summer heat', 'Crisp fall day', 'Snow day', 'Rainy and cozy'],
  },
  {
    self: 'What’s your style in a disagreement?',
    partner: 'What’s your partner’s style in a disagreement?',
    reveal: 'Each of your disagreement styles.',
    options: ['Needs to win', 'Needs space first', 'Wants to fix it now', 'Forgets it in 5 minutes'],
  },
  {
    self: 'What’s your pizza order?',
    partner: 'What’s your partner’s pizza order?',
    reveal: 'Each of your pizza orders.',
    options: ['Pepperoni', 'Plain cheese', 'Everything on it', 'Pineapple, fight me'],
  },
  {
    self: 'What’s your relationship with alarms?',
    partner: 'What’s your partner’s relationship with alarms?',
    reveal: 'Each of your alarm relationships.',
    options: ['One and up', 'Twelve alarms deep', 'Professional snoozer', 'Wakes up before it'],
  },
  {
    self: 'Which compliment lands hardest for you?',
    partner: 'Which compliment lands hardest for your partner?',
    reveal: 'The compliment that lands for each of you.',
    options: ['You’re hilarious', 'You’re brilliant', 'You look amazing', 'I’m proud of you'],
  },
  {
    self: 'What gets you through a road trip?',
    partner: 'What gets your partner through a road trip?',
    reveal: 'What gets each of you through a road trip.',
    options: ['Gas station snacks', 'Podcasts', 'The perfect playlist', 'A long nap'],
  },
  {
    self: 'What’s your holiday season energy?',
    partner: 'What’s your partner’s holiday season energy?',
    reveal: 'Each of your holiday energies.',
    options: ['Decorates in November', 'Bit of a grinch', 'Last-minute shopper', 'Baking everything'],
  },
  {
    self: 'What would you enter a talent show with?',
    partner: 'What would your partner enter a talent show with?',
    reveal: 'Each of your talent show entries.',
    options: ['Singing', 'Dancing', 'Stand-up comedy', 'A magic trick'],
  },
  {
    self: 'What’s really in your junk drawer?',
    partner: 'What’s really in your partner’s junk drawer?',
    reveal: 'What’s really in each of your junk drawers.',
    options: ['Mystery cables', 'Old receipts', 'Dead batteries', 'Keys to nothing'],
  },
  {
    self: 'How do you decide what’s for dinner?',
    partner: 'How does your partner decide what’s for dinner?',
    reveal: 'How each of you decides on dinner.',
    options: ['Knows immediately', 'Says “I don’t care” (cares)', 'Needs three options', '“Whatever you want”'],
  },
  {
    self: 'What’s your perfect free Saturday?',
    partner: 'What’s your partner’s perfect free Saturday?',
    reveal: 'Each of your perfect Saturdays.',
    options: ['Project mode', 'Total couch day', 'Out on an adventure', 'Friends over'],
  },
  {
    self: 'How do you most feel loved?',
    partner: 'How does your partner most feel loved?',
    reveal: 'How each of you most feels loved.',
    options: ['Kind words', 'Quality time', 'Little gifts', 'Helpful acts'],
  },
  {
    self: 'Who would you pick for a dinner guest?',
    partner: 'Who would your partner pick for a dinner guest?',
    reveal: 'Each of your dream dinner guests.',
    options: ['A comedian', 'A musician', 'An athlete', 'A famous chef'],
  },
  {
    self: 'What’s your morning mood?',
    partner: 'What’s your partner’s morning mood?',
    reveal: 'Each of your morning moods.',
    options: ['Pure sunshine', 'Do not speak to me', 'Coffee first, then human', 'Instant chaos'],
  },
  {
    self: 'What’s your pet-spoiling style?',
    partner: 'What’s your partner’s pet-spoiling style?',
    reveal: 'Each of your pet-spoiling styles.',
    options: ['Treats constantly', 'Full baby voice', 'They sleep in the bed', '“Strict” (not strict)'],
  },
  {
    self: 'What’s your retirement dream?',
    partner: 'What’s your partner’s retirement dream?',
    reveal: 'Each of your retirement dreams.',
    options: ['Beach town', 'Land in the mountains', 'Traveling the world', 'Never fully retiring'],
  },
  {
    self: 'What would you do with a surprise day off?',
    partner: 'What would your partner do with a surprise day off?',
    reveal: 'What each of you would do with a free day.',
    options: ['Sleep and snacks', 'Tackle the to-do list', 'Spontaneous trip', 'Hobby all day'],
  },
  {
    self: 'What’s your movie theater personality?',
    partner: 'What’s your partner’s movie theater personality?',
    reveal: 'Each of your movie theater personalities.',
    options: ['Silent and locked in', 'Whispers questions', 'Popcorn gone in 10', 'Checks their phone'],
  },
  {
    self: 'How do you act when you’re hangry?',
    partner: 'How does your partner act when they’re hangry?',
    reveal: 'How each of you acts when hangry.',
    options: ['Goes silent', 'Gets snippy', 'Dramatic sighing', 'Announces it loudly'],
  },
  {
    self: 'What’s your dream house must-have?',
    partner: 'What’s your partner’s dream house must-have?',
    reveal: 'Each of your dream house must-haves.',
    options: ['Huge kitchen', 'Home theater', 'Big backyard', 'Dream garage'],
  },
  {
    self: 'What’s your airport style?',
    partner: 'What’s your partner’s airport style?',
    reveal: 'Each of your airport styles.',
    options: ['There 3 hours early', 'Runs to the gate', 'Lounge lizard', 'Snack reconnaissance'],
  },
  {
    self: 'Which would you binge first?',
    partner: 'Which would your partner binge first?',
    reveal: 'What each of you would binge first.',
    options: ['A new series', 'A documentary', 'Old comfort show', 'YouTube rabbit hole'],
  },
  {
    self: 'What’s your signature dance move situation?',
    partner: 'What’s your partner’s signature dance move situation?',
    reveal: 'Each of your dance floor truths.',
    options: ['Actually good', 'Confidently bad', 'Only after two drinks', 'Holds the drinks'],
  },
  {
    self: 'What would your reality TV edit be?',
    partner: 'What would your partner’s reality TV edit be?',
    reveal: 'Each of your reality TV edits.',
    options: ['The villain', 'The sweetheart', 'Comic relief', 'Barely on screen'],
  },
  {
    self: 'What’s your shower personality?',
    partner: 'What’s your partner’s shower personality?',
    reveal: 'Each of your shower personalities.',
    options: ['In and out', 'Full concert', 'Deep thinker', 'Hot water bandit'],
  },
  {
    self: 'What’s your take on mornings before 7am?',
    partner: 'What’s your partner’s take on mornings before 7am?',
    reveal: 'Each of your takes on early mornings.',
    options: ['Best part of the day', 'Shouldn’t exist', 'Fine with coffee', 'What’s 7am?'],
  },
  {
    self: 'What kind of old person will you be?',
    partner: 'What kind of old person will your partner be?',
    reveal: 'The old person each of you will become.',
    options: ['Sweet and cookie-baking', 'Hilarious and blunt', 'Grumpy but lovable', 'Still doing too much'],
  },
  {
    self: 'What’s your relationship with leftovers?',
    partner: 'What’s your partner’s relationship with leftovers?',
    reveal: 'Each of your leftover philosophies.',
    options: ['Eats them for days', 'Forgets they exist', 'Claims them instantly', 'Refuses on principle'],
  },
  {
    self: 'What’s your hype song genre?',
    partner: 'What’s your partner’s hype song genre?',
    reveal: 'Each of your hype song genres.',
    options: ['Hip-hop', 'Pop bangers', 'Rock', 'Throwbacks only'],
  },
  {
    self: 'How do you handle spicy food?',
    partner: 'How does your partner handle spicy food?',
    reveal: 'How each of you handles heat.',
    options: ['Bring the fire', 'Medium is plenty', 'Mild, sweating anyway', 'Orders extra spice to show off'],
  },
  {
    self: 'What would you grab in a house fire (after people & pets)?',
    partner: 'What would your partner grab in a house fire (after people & pets)?',
    reveal: 'What each of you would grab first.',
    options: ['Phone', 'Photos & keepsakes', 'Laptop', 'The good blanket'],
  },
  {
    self: 'What’s your parallel parking confidence?',
    partner: 'What’s your partner’s parallel parking confidence?',
    reveal: 'Each of your parallel parking truths.',
    options: ['First try, every time', 'Three attempts minimum', 'Finds another spot', 'Makes the passenger do it'],
  },
  {
    self: 'Which store could you get lost in?',
    partner: 'Which store could your partner get lost in?',
    reveal: 'The store each of you gets lost in.',
    options: ['Target', 'Home improvement store', 'Bookstore', 'Costco samples tour'],
  },
  {
    self: 'What’s your text-back time for the group chat?',
    partner: 'What’s your partner’s text-back time for the group chat?',
    reveal: 'Each of your group chat response times.',
    options: ['Instant', 'Same day', 'Three business days', 'Lurks, never replies'],
  },
  {
    self: 'What’s your ideal date night?',
    partner: 'What’s your partner’s ideal date night?',
    reveal: 'Each of your ideal date nights.',
    options: ['Fancy dinner out', 'Cooking together', 'Activity date', 'Takeout and a movie'],
  },
  {
    self: 'How competitive are you at mini golf?',
    partner: 'How competitive is your partner at mini golf?',
    reveal: 'Each of your mini golf intensities.',
    options: ['It’s the Masters', 'Keeps score quietly', 'Just here for fun', 'Cheats openly'],
  },
  {
    self: 'What’s your camping tolerance?',
    partner: 'What’s your partner’s camping tolerance?',
    reveal: 'Each of your camping tolerances.',
    options: ['Full wilderness', 'Campground with showers', 'Cabin or nothing', 'Hotel, thanks'],
  },
  {
    self: 'What’s your karaoke-level confidence in the car?',
    partner: 'What’s your partner’s karaoke-level confidence in the car?',
    reveal: 'Each of your car concert levels.',
    options: ['Full performance', 'Steering wheel drums', 'Quiet hummer', 'Radio is background'],
  },
  {
    self: 'What do you do during scary parts of shows?',
    partner: 'What does your partner do during scary parts of shows?',
    reveal: 'What each of you does during the scary parts.',
    options: ['Watches everything', 'Pillow shield', 'Fake bathroom break', 'Narrates nervously'],
  },
  {
    self: 'What’s your online shopping pattern?',
    partner: 'What’s your partner’s online shopping pattern?',
    reveal: 'Each of your online shopping patterns.',
    options: ['Cart sits for weeks', 'Instant checkout', 'Midnight impulse buys', 'Returns half of it'],
  },
  {
    self: 'What would you do if you won the lottery tomorrow?',
    partner: 'What would your partner do if they won the lottery tomorrow?',
    reveal: 'What each of you would do with the jackpot.',
    options: ['Quit everything immediately', 'Invest most of it', 'Buy the dream house', 'Tell no one, act normal'],
  },
  {
    self: 'What’s your birthday preference?',
    partner: 'What’s your partner’s birthday preference?',
    reveal: 'Each of your birthday preferences.',
    options: ['Big party', 'Small dinner', 'Just us two', 'Pretend it’s not happening'],
  },
  {
    self: 'How are you with plants?',
    partner: 'How is your partner with plants?',
    reveal: 'Each of your plant-parent report cards.',
    options: ['Green thumb', 'Tries their best', 'Serial plant killer', 'Fake plants only'],
  },
  {
    self: 'What’s your gym personality?',
    partner: 'What’s your partner’s gym personality?',
    reveal: 'Each of your gym personalities.',
    options: ['Locked in, headphones on', 'Social hour', 'Cardio and out', 'Membership in name only'],
  },
  {
    self: 'What’s your approach to trying new food?',
    partner: 'What’s your partner’s approach to trying new food?',
    reveal: 'Each of your new-food approaches.',
    options: ['Will try anything', 'One brave bite', 'Needs convincing', 'Orders chicken tenders'],
  },
  {
    self: 'What era of music do you secretly live in?',
    partner: 'What era of music does your partner secretly live in?',
    reveal: 'The era each of you secretly lives in.',
    options: ['80s', '90s', '2000s', 'Whatever’s new'],
  },
  {
    self: 'What’s your board game of choice?',
    partner: 'What’s your partner’s board game of choice?',
    reveal: 'Each of your games of choice.',
    options: ['Monopoly (dangerous)', 'Cards', 'Trivia games', 'Video games instead'],
  },
  {
    self: 'How do you deal with a spider in the house?',
    partner: 'How does your partner deal with a spider in the house?',
    reveal: 'Each of your spider protocols.',
    options: ['Calm removal', 'Total elimination', 'Screams, delegates', 'Names it, lets it stay'],
  },
  {
    self: 'What’s your voicemail behavior?',
    partner: 'What’s your partner’s voicemail behavior?',
    reveal: 'Each of your voicemail behaviors.',
    options: ['Listens immediately', 'Red badge of shame', 'Texts back instead', 'Mailbox is full'],
  },
  {
    self: 'What’s your dream side hustle?',
    partner: 'What’s your partner’s dream side hustle?',
    reveal: 'Each of your dream side hustles.',
    options: ['Food or cooking', 'Something creative', 'Flipping/building things', 'Content creator'],
  },
  {
    self: 'How do you watch sports?',
    partner: 'How does your partner watch sports?',
    reveal: 'How each of you watches the game.',
    options: ['Yelling at the TV', 'Quietly stressed', 'For the snacks', 'Asks what’s happening'],
  },
  {
    self: 'What’s your packing style for trips?',
    partner: 'What’s your partner’s packing style for trips?',
    reveal: 'Each of your packing styles.',
    options: ['Packed days early', 'Night-before chaos', 'Overpacks everything', 'Forgets one key item'],
  },
  {
    self: 'What’s your comfort rewatch?',
    partner: 'What’s your partner’s comfort rewatch?',
    reveal: 'Each of your comfort rewatches.',
    options: ['A sitcom', 'A movie franchise', 'Cooking shows', 'Same 10 YouTube videos'],
  },
  {
    self: 'How do you react to surprises?',
    partner: 'How does your partner react to surprises?',
    reveal: 'How each of you handles surprises.',
    options: ['Loves them', 'Needs a warning', 'Figures them out early', 'Pretends to be surprised'],
  },
  {
    self: 'What’s your energy at a wedding?',
    partner: 'What’s your partner’s energy at a wedding?',
    reveal: 'Each of your wedding-guest energies.',
    options: ['First on the dance floor', 'Open bar strategist', 'Crying at the vows', 'Cake surveillance'],
  },
  {
    self: 'What’s your position on making the bed?',
    partner: 'What’s your partner’s position on making the bed?',
    reveal: 'Each of your bed-making positions.',
    options: ['Every single day', 'Only when guests come', 'Why? We’ll mess it up', 'What’s a top sheet?'],
  },
  {
    self: 'What do you do when a song you love comes on?',
    partner: 'What does your partner do when a song they love comes on?',
    reveal: 'What each of you does when the song hits.',
    options: ['Volume to max', 'Announces "MY SONG"', 'Silent head nod', 'Full choreography'],
  },
  {
    self: 'How would you survive a zombie apocalypse?',
    partner: 'How would your partner survive a zombie apocalypse?',
    reveal: 'Each of your zombie apocalypse strategies.',
    options: ['Fortify the house', 'Hit the road', 'Join a group', 'Honestly? Week one casualty'],
  },
  {
    self: 'What’s your snack drawer status?',
    partner: 'What’s your partner’s snack drawer status?',
    reveal: 'Each of your snack situations.',
    options: ['Fully stocked pantry', 'Hidden stash', 'Eats it same day', 'Steals yours instead'],
  },
  {
    self: 'What chore do you secretly kind of enjoy?',
    partner: 'What chore does your partner secretly kind of enjoy?',
    reveal: 'The chore each of you secretly enjoys.',
    options: ['Mowing/yard work', 'Organizing', 'Cooking dinner', 'Folding warm laundry'],
  },
  {
    self: 'How long can you go without checking your phone?',
    partner: 'How long can your partner go without checking their phone?',
    reveal: 'Each of your phone-free endurance records.',
    options: ['Hours, easily', 'About 20 minutes', 'It’s in my hand now', 'Depends who’s texting'],
  },
  {
    self: 'What’s your kitchen disaster most likely to be?',
    partner: 'What’s your partner’s kitchen disaster most likely to be?',
    reveal: 'Each of your signature kitchen disasters.',
    options: ['Smoke alarm chef', 'Uses every dish', 'Abandons the recipe', 'Orders backup pizza'],
  },
  {
    self: 'What’s your social battery size?',
    partner: 'What’s your partner’s social battery size?',
    reveal: 'Each of your social battery sizes.',
    options: ['Never runs out', 'Good for one event', 'Two hours max', 'Prefers the dogs'],
  },
  {
    self: 'What would your talk show be about?',
    partner: 'What would your partner’s talk show be about?',
    reveal: 'Each of your talk show topics.',
    options: ['Food', 'Hot takes', 'Interviews with dogs', 'True crime deep dives'],
  },
  {
    self: 'What’s your love language for giving?',
    partner: 'What’s your partner’s love language for giving?',
    reveal: 'How each of you shows love.',
    options: ['Doing helpful things', 'Planning time together', 'Little surprises', 'Constant compliments'],
  },
];

// --- Daily question selection -----------------------------------------------------
// Deterministic from the LOCAL date, so both phones (and Phase 2's server)
// agree on today's question, and it changes at local midnight.

function getDayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function getDayNumber() {
  const d = new Date();
  // Days since epoch, in local time.
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000);
}

function getPromptIndexForDay(dayNumber, skipOffset) {
  // Knuth multiplicative hash scatters consecutive days across the library
  // so day N and day N+1 aren't neighboring questions.
  const scattered = (dayNumber * 2654435761) >>> 0;
  return (scattered + skipOffset) % PROMPTS.length;
}

// --- Root ----------------------------------------------------------------------

export default function App() {
  const [fontsLoaded] = useFonts({
    Fraunces_400Regular,
    Fraunces_600SemiBold,
    Fraunces_900Black,
    Fraunces_900Black_Italic,
  });

  const [entered, setEntered] = useState(false);
  const [activePlayerId, setActivePlayerId] = useState('p1');
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const music = useAudioPlayer(require('./assets/theme.mp3'));
  const music2 = useAudioPlayer(require('./assets/theme2.mp3'));
  const voice = useAudioPlayer(require('./assets/duet-voice.mp3'));

  // --- SOUND EFFECTS (scaffolded — uncomment when the files exist) -----------
  // const tapSfx = useAudioPlayer(require('./assets/tap.mp3'));
  // const lockSfx = useAudioPlayer(require('./assets/lock.mp3'));
  // const stingSfx = useAudioPlayer(require('./assets/sting.mp3'));

  const playSfx = (player) => {
    // if (!mutedRef.current && player) {
    //   player.seekTo(0);
    //   player.play();
    // }
  };

  useEffect(() => {
    music.loop = true;
    music.volume = 0.2;
    music.play();
    music2.loop = true;
    music2.volume = 0.2;
  }, []);

  useEffect(() => {
    if (entered) {
      music.pause();
      music2.seekTo(0);
      if (!mutedRef.current) {
        music2.play();
      }
    } else {
      music2.pause();
      if (!mutedRef.current) {
        music.play();
      }
    }
  }, [entered]);

  useEffect(() => {
    mutedRef.current = muted;
    if (muted) {
      music.pause();
      music2.pause();
      voice.pause();
    } else if (entered) {
      music2.play();
    } else {
      music.play();
    }
  }, [muted, entered]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!mutedRef.current) {
        voice.seekTo(0);
        voice.play();
      }
    }, 11000);
    return () => clearInterval(interval);
  }, []);

  // --- Round state -----------------------------------------------------------

  const [dayKey, setDayKey] = useState(getDayKey());
  const [skipOffset, setSkipOffset] = useState(0); // how many skips applied today
  const [submissions, setSubmissions] = useState({ p1: null, p2: null });
  const [drafts, setDrafts] = useState({
    p1: { page: 'answer', answer: null, prediction: null },
    p2: { page: 'answer', answer: null, prediction: null },
  });

  // Skip negotiation: null, or { requestedBy: 'p1'|'p2', requestedAt: ms }
  const [skipRequest, setSkipRequest] = useState(null);
  // Banner notices per player: { p1: string|null, p2: string|null }
  const [notices, setNotices] = useState({ p1: null, p2: null });
  // A ticking clock so the skip-waiting countdown stays fresh.
  const [, setClockTick] = useState(0);

  const freshRound = () => {
    setSubmissions({ p1: null, p2: null });
    setDrafts({
      p1: { page: 'answer', answer: null, prediction: null },
      p2: { page: 'answer', answer: null, prediction: null },
    });
    setSkipRequest(null);
  };

  // Midnight rollover: check every 30s whether the local date changed.
  useEffect(() => {
    const interval = setInterval(() => {
      const nowKey = getDayKey();
      if (nowKey !== dayKey) {
        setDayKey(nowKey);
        setSkipOffset(0);
        setNotices({ p1: null, p2: null });
        freshRound();
      }
      setClockTick((t) => t + 1); // refresh countdowns
    }, 30000);
    return () => clearInterval(interval);
  }, [dayKey]);

  // Auto-skip: if a pending request ages past the timeout, skip automatically.
  useEffect(() => {
    if (!skipRequest) return;
    const applyAutoSkip = () => {
      setSkipOffset((o) => o + 1);
      freshRound();
      setNotices({
        p1: 'The question was skipped automatically after 6 hours with no response.',
        p2: 'The question was skipped automatically after 6 hours with no response.',
      });
    };
    const remaining = skipRequest.requestedAt + SKIP_TIMEOUT_MS - Date.now();
    if (remaining <= 0) {
      applyAutoSkip();
      return;
    }
    const timer = setTimeout(applyAutoSkip, remaining);
    return () => clearTimeout(timer);
  }, [skipRequest]);

  const prompt = PROMPTS[getPromptIndexForDay(getDayNumber(), skipOffset)];

  if (!fontsLoaded) {
    return (
      <View style={[styles.loading]}>
        <ActivityIndicator color={GOLD} />
      </View>
    );
  }

  const me = PLAYERS[activePlayerId];
  const partnerId = activePlayerId === 'p1' ? 'p2' : 'p1';
  const partner = PLAYERS[partnerId];
  const draft = drafts[activePlayerId];
  const bothSubmitted = submissions.p1 && submissions.p2;
  const iSubmitted = !!submissions[activePlayerId];

  const setDraft = (patch) =>
    setDrafts((prev) => ({
      ...prev,
      [activePlayerId]: { ...prev[activePlayerId], ...patch },
    }));

  const lockIn = () => {
    // playSfx(lockSfx);
    setSubmissions((prev) => ({
      ...prev,
      [activePlayerId]: { answer: draft.answer, prediction: draft.prediction },
    }));
  };

  const resetRound = () => {
    freshRound();
  };

  // --- Skip flow actions -------------------------------------------------------

  const requestSkip = () => {
    setSkipRequest({ requestedBy: activePlayerId, requestedAt: Date.now() });
  };

  const agreeToSkip = () => {
    setSkipOffset((o) => o + 1);
    freshRound();
    setNotices((prev) => ({
      ...prev,
      [skipRequest.requestedBy]: `${PLAYERS[activePlayerId].name} agreed — new question below.`,
    }));
  };

  const declineSkip = () => {
    const requester = skipRequest.requestedBy;
    setSkipRequest(null);
    setNotices((prev) => ({
      ...prev,
      [requester]: `${PLAYERS[activePlayerId].name} wants to keep this one. Answer up.`,
    }));
  };

  const dismissNotice = () => {
    setNotices((prev) => ({ ...prev, [activePlayerId]: null }));
  };

  const openInstagram = async () => {
    const appUrl = `instagram://user?username=${INSTAGRAM_USERNAME}`;
    const webUrl = `https://www.instagram.com/${INSTAGRAM_USERNAME}/`;
    try {
      const canOpen = await Linking.canOpenURL(appUrl);
      if (canOpen) {
        await Linking.openURL(appUrl);
      } else {
        await Linking.openURL(webUrl);
      }
    } catch {
      Linking.openURL(webUrl);
    }
  };

  // --- Route to the right page for THIS player ---
  let page;
  let step;
  if (!entered) {
    page = <LandingPage onEnter={() => setEntered(true)} />;
    step = -1;
  } else if (skipRequest && skipRequest.requestedBy !== activePlayerId) {
    // The "notification on open": partner has a skip request waiting for me.
    page = (
      <SkipRequestPage
        prompt={prompt}
        requester={PLAYERS[skipRequest.requestedBy]}
        onAgree={agreeToSkip}
        onDecline={declineSkip}
      />
    );
    step = 0;
  } else if (skipRequest && skipRequest.requestedBy === activePlayerId) {
    page = (
      <SkipWaitingPage
        partner={partner}
        requestedAt={skipRequest.requestedAt}
      />
    );
    step = 0;
  } else if (bothSubmitted) {
    page = (
      <RevealPage
        prompt={prompt}
        submissions={submissions}
        viewerId={activePlayerId}
        onReset={resetRound}
      />
    );
    step = 2;
  } else if (iSubmitted) {
    page = <WaitingPage me={me} partner={partner} />;
    step = 2;
  } else if (draft.page === 'predict') {
    page = (
      <PredictPage
        prompt={prompt}
        me={me}
        partner={partner}
        prediction={draft.prediction}
        onPick={(prediction) => setDraft({ prediction })}
        onBack={() => setDraft({ page: 'answer' })}
        onLockIn={lockIn}
      />
    );
    step = 1;
  } else {
    page = (
      <AnswerPage
        prompt={prompt}
        me={me}
        answer={draft.answer}
        notice={notices[activePlayerId]}
        onDismissNotice={dismissNotice}
        onPick={(answer) => setDraft({ answer })}
        onContinue={() => setDraft({ page: 'predict' })}
        onRequestSkip={requestSkip}
      />
    );
    step = 0;
  }

  return (
    <View style={styles.root}>
      <StageBackground me={me} partner={partner} />
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        {entered && (
          <DebugToggle activePlayerId={activePlayerId} onSwitch={setActivePlayerId} />
        )}
        {entered && <ProgressDots step={step} accent={me.color} />}
        <ScrollView contentContainerStyle={styles.scroll}>{page}</ScrollView>
        <TouchableOpacity style={styles.muteChip} onPress={() => setMuted((m) => !m)}>
          <Text style={styles.muteChipText}>{muted ? '🔇' : '🔊'}</Text>
        </TouchableOpacity>
        {entered && (
          <TouchableOpacity style={styles.backChip} onPress={() => setEntered(false)}>
            <Text style={styles.backChipText}>← HOME</Text>
          </TouchableOpacity>
        )}
        {!entered && (
          <TouchableOpacity style={styles.igChip} onPress={openInstagram}>
            <Text style={styles.igChipLabel}>FOLLOW ME ON INSTAGRAM</Text>
            <View style={styles.igChipButton}>
              <Text style={styles.igChipHandle}>@{INSTAGRAM_USERNAME}</Text>
            </View>
          </TouchableOpacity>
        )}
      </SafeAreaView>
    </View>
  );
}

// --- Background: gradient stage + ambient glow lighting --------------------------

function StageBackground({ me, partner }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={[STAGE_TOP, STAGE_BOTTOM]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.orb, styles.orbTopRight, { backgroundColor: me.color }]} />
      <View style={[styles.orb, styles.orbBottomLeft, { backgroundColor: partner.color }]} />
      <View style={[styles.orb, styles.orbCenterFaint, { backgroundColor: GOLD }]} />
    </View>
  );
}

// --- Animation components ------------------------------------------------------------

function FadeInUp({ delay = 0, children, style }) {
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

function IdleFloat({ children, phase = 0, amplitude = -4 }) {
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

function Pulse({ children, low = 0.55 }) {
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

function StampIn({ children, delay = 0 }) {
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

function Wiggle({ children, phase = 0 }) {
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

function DrawnUnderline({ color, delay = 0 }) {
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

// --- Chrome ------------------------------------------------------------------------

function DebugToggle({ activePlayerId, onSwitch }) {
  return (
    <View style={styles.debugBar}>
      <Text style={styles.debugLabel}>PHONE OF</Text>
      {Object.values(PLAYERS).map((p) => {
        const active = activePlayerId === p.id;
        return (
          <TouchableOpacity
            key={p.id}
            onPress={() => onSwitch(p.id)}
            style={[
              styles.debugChip,
              { borderColor: p.color },
              active && { backgroundColor: p.color },
            ]}
          >
            <Text style={[styles.debugChipText, { color: active ? STAGE_BOTTOM : p.color }]}>
              {p.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function ProgressDots({ step, accent }) {
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

function NoticeBanner({ text, onDismiss }) {
  if (!text) return null;
  return (
    <FadeInUp delay={0}>
      <TouchableOpacity style={styles.noticeBanner} onPress={onDismiss}>
        <Text style={styles.noticeBannerText}>{text}</Text>
        <Text style={styles.noticeBannerDismiss}>tap to dismiss</Text>
      </TouchableOpacity>
    </FadeInUp>
  );
}

// --- Seesaw button: rocks forever; white flash waiting, gold flash when armed ------

function SeesawButton({ label, onPress, disabled }) {
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
        >
          <Text style={[styles.primaryButtonText, disabled && { color: CHALK }]}>
            {label}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

// --- Page 0: LANDING -------------------------------------------------------------------

function LandingPage({ onEnter }) {
  // Placeholder stats — these get wired to the database in Phase 2.
  const streak = 0;
  const score = { p1: 0, p2: 0 };

  const today = new Date()
    .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    .toUpperCase()
    .replace(', ', ' · ')
    .replace(',', ' ·');

  return (
    <View style={styles.landing}>
      <View style={styles.landingCenter}>
        <FadeInUp delay={0}>
          <Pulse low={0.5}>
            <Text style={styles.landingDate}>{today}</Text>
          </Pulse>
        </FadeInUp>
        <FadeInUp delay={100}>
          <IdleFloat amplitude={-6}>
            <Text style={styles.landingTitle}>Duet</Text>
          </IdleFloat>
        </FadeInUp>
        <DrawnUnderline color={GOLD} delay={600} />
        <FadeInUp delay={450}>
          <IdleFloat phase={2} amplitude={-3}>
            <Text style={styles.landingTagline}>
              One question. Two answers.{'\n'}Who knows who better?
            </Text>
          </IdleFloat>
        </FadeInUp>

        <FadeInUp delay={650}>
          <View style={styles.statRow}>
            <View style={[styles.statPill, { borderColor: GOLD }]}>
              <Text style={styles.statPillText}>🔥 {streak} DAY STREAK</Text>
            </View>
            <View style={[styles.statPill, { borderColor: LINE }]}>
              <Text style={styles.statPillText}>
                <Text style={{ color: PLAYERS.p1.color }}>{score.p1}</Text>
                <Text style={{ color: DIM }}>  ·  </Text>
                <Text style={{ color: PLAYERS.p2.color }}>{score.p2}</Text>
              </Text>
            </View>
          </View>
        </FadeInUp>

        <FadeInUp delay={800}>
          <SeesawButton label="PLAY TONIGHT'S ROUND" onPress={onEnter} disabled={false} />
        </FadeInUp>
      </View>

      <FadeInUp delay={1100}>
        <Text style={styles.landingFooter}>
          v{Constants.expoConfig?.version ?? '0.0.0'} · crafted by Brandon Rice
        </Text>
      </FadeInUp>
    </View>
  );
}

// --- Page 1: YOUR ANSWER --------------------------------------------------------------

function AnswerPage({ prompt, me, answer, notice, onDismissNotice, onPick, onContinue, onRequestSkip }) {
  return (
    <View style={styles.answerPage}>
      <NoticeBanner text={notice} onDismiss={onDismissNotice} />
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

      <FadeInUp delay={520}>
        <SeesawButton
          label={answer ? 'CONTINUE' : 'PICK ONE TO CONTINUE'}
          disabled={!answer}
          onPress={onContinue}
        />
      </FadeInUp>

      <FadeInUp delay={650}>
        <TouchableOpacity style={styles.backLink} onPress={onRequestSkip}>
          <Text style={styles.backLinkText}>Skip this question →</Text>
        </TouchableOpacity>
      </FadeInUp>
    </View>
  );
}

// --- Page 2: CALL IT --------------------------------------------------------------------

function PredictPage({ prompt, me, partner, prediction, onPick, onBack, onLockIn }) {
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

      <FadeInUp delay={520}>
        <SeesawButton
          label={prediction ? 'LOCK IT IN' : 'MAKE YOUR CALL'}
          disabled={!prediction}
          onPress={onLockIn}
        />
      </FadeInUp>

      <FadeInUp delay={650}>
        <TouchableOpacity style={styles.backLink} onPress={onBack}>
          <Text style={styles.backLinkText}>← Change my answer</Text>
        </TouchableOpacity>
      </FadeInUp>
    </View>
  );
}

// --- Shared option list --------------------------------------------------------------------

function OptionGroup({ options, selected, onSelect }) {
  return (
    <View style={styles.optionGroup}>
      {options.map((option, index) => {
        const isSelected = selected === option;
        return (
          <FadeInUp key={option} delay={200 + index * 80}>
            <Wiggle phase={index}>
              <TouchableOpacity
                onPress={() => onSelect(option)}
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
              </TouchableOpacity>
            </Wiggle>
          </FadeInUp>
        );
      })}
    </View>
  );
}

// --- SKIP FLOW PAGES -------------------------------------------------------------------------

// The requester's holding pattern while their partner decides.
function SkipWaitingPage({ partner, requestedAt }) {
  const remainingMs = Math.max(0, requestedAt + SKIP_TIMEOUT_MS - Date.now());
  const hours = Math.floor(remainingMs / 3600000);
  const minutes = Math.ceil((remainingMs % 3600000) / 60000);

  return (
    <View style={styles.centered}>
      <FadeInUp delay={0}>
        <IdleFloat amplitude={-5}>
          <View style={[styles.lockBadge, { borderColor: GOLD }]}>
            <Text style={styles.lockEmoji}>⏳</Text>
          </View>
        </IdleFloat>
      </FadeInUp>
      <FadeInUp delay={140}>
        <Text style={styles.waitingTitle}>Skip requested.</Text>
      </FadeInUp>
      <FadeInUp delay={260}>
        <Text style={styles.waitingSub}>
          Waiting on{' '}
          <Text style={{ color: partner.color, fontFamily: 'Fraunces_600SemiBold' }}>
            {partner.name}
          </Text>{' '}
          to agree.{'\n'}If there's no response within 6 hours, tonight's
          question will be skipped automatically.
        </Text>
      </FadeInUp>
      <FadeInUp delay={420}>
        <Text style={styles.debugHint}>
          Auto-skips in about {hours}h {minutes}m
        </Text>
      </FadeInUp>
    </View>
  );
}

// What the partner sees when they open the app with a skip pending.
function SkipRequestPage({ prompt, requester, onAgree, onDecline }) {
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
        <TouchableOpacity style={styles.declineButton} onPress={onDecline}>
          <Text style={styles.declineButtonText}>NO — LET'S ANSWER IT</Text>
        </TouchableOpacity>
      </FadeInUp>
    </View>
  );
}

// --- Page 3a: WAITING --------------------------------------------------------------------------

function WaitingPage({ me, partner }) {
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
        <Text style={styles.debugHint}>
          (Dev: flip the toggle up top and answer as {partner.name}.)
        </Text>
      </FadeInUp>
    </View>
  );
}

// --- Page 3b: THE REVEAL --------------------------------------------------------------------------

function RevealPage({ prompt, submissions, viewerId, onReset }) {
  const otherId = viewerId === 'p1' ? 'p2' : 'p1';
  const me = { ...PLAYERS[viewerId], ...submissions[viewerId] };
  const them = { ...PLAYERS[otherId], ...submissions[otherId] };

  const iCalledIt = me.prediction === them.answer;
  const theyCalledIt = them.prediction === me.answer;
  const mePts = iCalledIt ? POINTS_FOR_CORRECT_PREDICTION : 0;
  const themPts = theyCalledIt ? POINTS_FOR_CORRECT_PREDICTION : 0;

  let headline;
  if (mePts === themPts) {
    headline = mePts > 0 ? 'Both called it. Suspicious.' : 'Nobody saw that coming.';
  } else if (mePts > themPts) {
    headline = `${me.name} takes the night.`;
  } else {
    headline = `${them.name} takes the night.`;
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
          player={me}
          isYou
          answer={me.answer}
          prediction={me.prediction}
          predictionAbout={them}
          calledIt={iCalledIt}
          points={mePts}
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
          player={them}
          answer={them.answer}
          prediction={them.prediction}
          predictionAbout={me}
          calledIt={theyCalledIt}
          points={themPts}
          tilt="1.2deg"
          verdictDelay={1700}
        />
      </FadeInUp>

      <FadeInUp delay={2100}>
        <Text style={styles.scoreHeadline}>{headline}</Text>
      </FadeInUp>
      <FadeInUp delay={2250}>
        <View style={styles.scoreRow}>
          <ScorePill name={me.name} color={me.color} points={mePts} />
          <ScorePill name={them.name} color={them.color} points={themPts} />
        </View>
      </FadeInUp>

      <FadeInUp delay={2500}>
        <TouchableOpacity style={styles.resetButton} onPress={onReset}>
          <Text style={styles.resetButtonText}>Reset round (dev)</Text>
        </TouchableOpacity>
      </FadeInUp>
    </View>
  );
}

function RevealCard({ player, isYou, answer, prediction, predictionAbout, calledIt, points, tilt, verdictDelay = 0 }) {
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
      </Text>

      <StampIn delay={verdictDelay}>
        <View
          style={[
            styles.verdict,
            calledIt
              ? { backgroundColor: GOLD }
              : { borderWidth: 1, borderColor: LINE },
          ]}
        >
          <Text style={[styles.verdictText, { color: calledIt ? STAGE_BOTTOM : DIM }]}>
            {calledIt ? `🎯 CALLED IT +${points}` : 'NOT EVEN CLOSE'}
          </Text>
        </View>
      </StampIn>
    </View>
  );
}

function ScorePill({ name, color, points }) {
  return (
    <View style={[styles.scorePill, { borderColor: color }]}>
      <Text style={[styles.scorePillName, { color }]}>{name}</Text>
      <Text style={styles.scorePillPoints}>+{points}</Text>
    </View>
  );
}

// --- Styles ---------------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: STAGE_BOTTOM },
  safe: { flex: 1 },
  loading: {
    flex: 1,
    backgroundColor: STAGE_BOTTOM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { padding: 24, paddingBottom: 56, flexGrow: 1 },

  orb: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 170,
    opacity: 0.16,
  },
  orbTopRight: { top: -140, right: -120 },
  orbBottomLeft: { bottom: -160, left: -140 },
  orbCenterFaint: { top: '38%', left: '30%', opacity: 0.05 },

  debugBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  debugLabel: { fontSize: 10, letterSpacing: 1.5, color: DIM, marginRight: 4 },
  debugChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  debugChipText: { fontSize: 13, fontWeight: '800' },
  muteChip: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    padding: 10,
  },
  muteChipText: { fontSize: 18 },
  backChip: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    padding: 10,
  },
  backChipText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: DIM,
  },
  igChip: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    padding: 10,
  },
  igChipLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#6a5f96',
    marginBottom: 5,
  },
  igChipButton: {
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderColor: LINE,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: RAISED,
  },
  igChipHandle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: CHALK,
  },
  landingDate: {
    fontSize: 12,
    letterSpacing: 3,
    fontWeight: '800',
    color: GOLD,
    textAlign: 'center',
    marginBottom: 14,
  },
  statRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 28,
  },
  statPill: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: RAISED,
  },
  statPillText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    color: CHALK,
  },

  noticeBanner: {
    borderWidth: 1.5,
    borderColor: GOLD,
    borderRadius: 14,
    backgroundColor: 'rgba(255,200,74,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 22,
  },
  noticeBannerText: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 14,
    color: GOLD,
    textAlign: 'center',
    lineHeight: 20,
  },
  noticeBannerDismiss: {
    fontSize: 10,
    color: DIM,
    textAlign: 'center',
    marginTop: 5,
    letterSpacing: 1,
  },

  skipQuestionCard: {
    borderWidth: 1.5,
    borderColor: LINE,
    borderRadius: 16,
    backgroundColor: RAISED,
    padding: 16,
    marginBottom: 26,
  },
  skipQuestionLabel: {
    fontSize: 10,
    letterSpacing: 2,
    color: DIM,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  skipQuestionText: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 16,
    color: CHALK,
    textAlign: 'center',
    lineHeight: 23,
  },
  declineButton: {
    borderWidth: 1.5,
    borderColor: LINE,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: RAISED,
  },
  declineButtonText: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2,
    color: CHALK,
  },

  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 24,
    paddingBottom: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: LINE,
  },

  kicker: {
    fontSize: 12,
    letterSpacing: 3,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
    alignSelf: 'center',
  },
  question: {
    fontFamily: 'Fraunces_900Black',
    fontSize: 32,
    color: CHALK,
    lineHeight: 38,
    marginBottom: 24,
    textAlign: 'center',
  },
  questionItalic: { fontFamily: 'Fraunces_900Black_Italic' },
  answerPage: {
    flex: 1,
    justifyContent: 'center',
  },
  landing: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: 40,
  },
  landingCenter: {
    flex: 1,
    justifyContent: 'center',
  },
  landingTitle: {
    fontFamily: 'Fraunces_900Black_Italic',
    fontSize: 76,
    color: CHALK,
    textAlign: 'center',
    marginBottom: 6,
  },
  landingTagline: {
    fontFamily: 'Fraunces_400Regular',
    fontSize: 17,
    color: DIM,
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 36,
  },
  landingFooter: {
    fontSize: 12,
    color: '#6a5f96',
    textAlign: 'center',
    letterSpacing: 0.5,
  },

  optionGroup: { gap: 10, marginBottom: 28 },
  option: {
    borderWidth: 1.5,
    borderColor: LINE,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    backgroundColor: RAISED,
    alignItems: 'center',
  },
  optionText: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 18,
    color: CHALK,
  },

  primaryButton: {
    backgroundColor: GOLD,
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: RAISED,
    borderWidth: 1,
    borderColor: LINE,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
    color: STAGE_BOTTOM,
  },

  backLink: { alignItems: 'center', paddingVertical: 18 },
  backLinkText: { color: DIM, fontSize: 14 },

  centered: { alignItems: 'center', paddingTop: 64, paddingHorizontal: 12 },
  lockBadge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
    backgroundColor: RAISED,
  },
  lockEmoji: { fontSize: 36 },
  waitingTitle: {
    fontFamily: 'Fraunces_900Black',
    fontSize: 30,
    color: CHALK,
    marginBottom: 12,
    textAlign: 'center',
  },
  waitingSub: {
    fontFamily: 'Fraunces_400Regular',
    fontSize: 17,
    color: DIM,
    textAlign: 'center',
    lineHeight: 26,
  },
  debugHint: { fontSize: 12, color: '#6a5f96', marginTop: 32, textAlign: 'center' },

  revealCard: {
    backgroundColor: 'rgba(20,12,44,0.82)',
    borderRadius: 20,
    borderWidth: 2,
    padding: 18,
    paddingTop: 24,
  },
  revealNameTag: {
    position: 'absolute',
    top: -13,
    left: 16,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  revealNameText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: STAGE_BOTTOM,
  },
  revealAnswerLabel: {
    fontSize: 10,
    letterSpacing: 2,
    color: DIM,
    fontWeight: '700',
    marginBottom: 4,
  },
  revealAnswer: {
    fontFamily: 'Fraunces_900Black',
    fontSize: 26,
    marginBottom: 12,
  },
  revealPrediction: {
    fontFamily: 'Fraunces_400Regular',
    fontSize: 14,
    color: DIM,
    marginBottom: 14,
    lineHeight: 21,
  },
  verdict: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  verdictText: { fontSize: 12, fontWeight: '900', letterSpacing: 1 },

  vsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 18,
  },
  vsLine: { flex: 1, height: 1, backgroundColor: LINE },
  vsText: {
    fontFamily: 'Fraunces_900Black_Italic',
    color: GOLD,
    fontSize: 18,
  },

  scoreHeadline: {
    fontFamily: 'Fraunces_900Black_Italic',
    fontSize: 22,
    color: GOLD,
    textAlign: 'center',
    marginTop: 26,
    marginBottom: 16,
  },
  scoreRow: { flexDirection: 'row', gap: 12, justifyContent: 'center' },
  scorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: RAISED,
  },
  scorePillName: { fontSize: 14, fontWeight: '800' },
  scorePillPoints: { fontSize: 14, fontWeight: '900', color: CHALK },

  resetButton: { alignItems: 'center', paddingVertical: 22, marginTop: 8 },
  resetButtonText: { fontSize: 13, color: DIM, textDecorationLine: 'underline' },
});