import type { ExperienceStory, LeadershipPrinciple } from './contracts';

/**
 * Chooses which stored experiences to put in front of the model.
 *
 * Selection is local, keyword-based and deterministic rather than an embedding lookup or
 * a second model call. It has to run between the interviewer finishing and the answer
 * starting, so anything with a network round-trip is the wrong tool; it also means the
 * behaviour is identical in tests and in an interview.
 *
 * The point is not only relevance. Sending the whole bank would dilute the answer, cost
 * tokens on questions that are not behavioural at all, and leave the model unable to tell
 * which story it has already used in this session.
 */

/**
 * Openers that introduce a request, which only mean "tell me a story" when paired with
 * something experiential. "Describe a situation where..." is behavioural; "describe a
 * binary search tree" is not.
 */
const NARRATIVE_OPENERS = [
  'tell me about',
  'describe',
  'give me an example',
  'give an example',
  'walk me through',
  'talk to me about',
];

const EXPERIENCE_OBJECTS = [
  'a time',
  'an occasion',
  'a situation',
  'a project you',
  'a system you',
  'something you',
  'an experience',
  'a conflict',
  'a disagreement',
  'a failure',
  'a mistake',
  'when you',
  'yourself',
  'your experience',
  'your background',
  'your project',
];

/** Frames that are behavioural on their own, with no second half needed. */
const DIRECT_FRAMES = [
  'a time when',
  'have you ever',
  'did you ever',
  'when have you',
  'what did you do when',
  'how did you handle',
  'how did you deal',
  'how have you',
  'give me an example of',
  'share an example',
  'most innovative thing you',
  'proudest',
  'why amazon',
  'why do you want to work',
];

/**
 * Second person plus a past-tense experiential verb. Catches "a disagreement you had"
 * without catching "if the lookup fails".
 */
const PERSONAL_PAST =
  /\byou\s+(?:ever\s+|once\s+)?(?:disagreed|failed|struggled|missed|made|pushed|argued|convinced|led|owned|shipped|broke|handled|dealt|had to|mentored|simplified|improved|influenced|delivered|sacrificed|took)\b/;

/**
 * How Amazon interviewers actually phrase each principle. Questions rarely name the
 * principle ("a decision with incomplete data" is Bias for Action), so matching only on
 * the principle's own words left most tagged stories unmatched.
 */
const PRINCIPLE_CUES: Record<LeadershipPrinciple, RegExp> = {
  'Customer Obsession':
    /\b(?:customers?|clients?|end users?|user feedback|stakeholders? needs?|customer experience)\b/,
  Ownership:
    /\b(?:above and beyond|beyond (?:your|the) (?:role|scope|responsibilit\w*)|outside (?:your|the) (?:role|scope|job)|took ownership|not your (?:job|responsibility)|no one else|nobody else|long[- ]term (?:over|instead)|own(?:ed)? (?:it|the problem))\b/,
  'Invent and Simplify':
    /\b(?:innovat\w*|simplif\w*|invent\w*|creative|new (?:idea|approach|way)|automat\w*|improved? (?:a|the) process|streamlin\w*)\b/,
  'Are Right, A Lot':
    /\b(?:judg(?:e)?ment|good decision|wrong decision|right call|intuition|gut feel\w*|diverse perspectives|conflicting (?:information|data|opinions))\b/,
  'Learn and Be Curious':
    /\b(?:learn(?:ed|t)? (?:a|something) new|new (?:technology|skill|domain|language)|curious|curiosity|unfamiliar|outside your (?:expertise|comfort zone)|self[- ]taught)\b/,
  'Hire and Develop the Best':
    /\b(?:mentor\w*|coach\w*|develop(?:ed)? (?:a|someone|others|your team)|hire|hiring|onboard\w*|grow (?:a|someone|your)|junior)\b/,
  'Insist on the Highest Standards':
    /\b(?:high(?:est)? standards?|quality|raise(?:d)? the bar|not good enough|dissatisfied with|code review|refused to (?:ship|compromise))\b/,
  'Think Big':
    /\b(?:think big|big picture|bold|vision|ambitious|long[- ]term vision|transformative)\b/,
  'Bias for Action':
    /\b(?:incomplete (?:data|information)|without (?:all|complete|enough) (?:the )?(?:data|information|facts)|calculated risk|act(?:ed)? quickly|quick decision|urgent|speed|without waiting)\b/,
  Frugality:
    /\b(?:limited (?:resources|budget|time|headcount)|frugal\w*|reduce(?:d)? costs?|cost savings?|with less|constrain\w* (?:budget|resources))\b/,
  'Earn Trust':
    /\b(?:trust|credibility|difficult feedback|critical feedback|admit(?:ted)? (?:a|your) mistake|difficult conversation|vulnerab\w*)\b/,
  'Dive Deep':
    /\b(?:root cause|dig(?:ging)? (?:deep|into)|deep dive|dove deep|investigat\w*|anomal\w*|metrics? (?:did not|didn't) (?:add up|match)|debug\w*|data to)\b/,
  'Have Backbone; Disagree and Commit':
    /\b(?:disagree\w*|push(?:ed)? back|conflict|unpopular|challenged (?:a|your|the)|disagree and commit|went against)\b/,
  'Deliver Results':
    /\b(?:deadline|deliver\w*|obstacles?|setbacks?|under pressure|missed (?:a|the) (?:goal|target)|achieve\w* (?:a|the) goal|despite)\b/,
  "Strive to Be Earth's Best Employer":
    /\b(?:morale|well[- ]?being|inclusive|inclusion|work environment|burn ?out|psychological safety)\b/,
  'Success and Scale Bring Broad Responsibility':
    /\b(?:ethic\w*|community|sustainab\w*|privacy|societ\w*|second[- ]order|unintended consequences?)\b/,
};

/** Principles a question is probing, inferred from Amazon's usual phrasings. */
export function inferPrinciples(question: string): LeadershipPrinciple[] {
  const text = question.toLowerCase();
  return (Object.keys(PRINCIPLE_CUES) as LeadershipPrinciple[]).filter((principle) =>
    PRINCIPLE_CUES[principle].test(text),
  );
}

const FAILURE_CUES = [
  'fail',
  'failure',
  'mistake',
  'went wrong',
  'regret',
  'did not go',
  "didn't go",
  'setback',
  'missed a deadline',
  'wrong decision',
];

const CONFLICT_CUES = [
  'disagree',
  'disagreement',
  'conflict',
  'pushed back',
  'push back',
  'argued',
  'convince',
  'difficult teammate',
  'difficult stakeholder',
  'said no',
];

/** Words too common to carry any signal about which story fits. */
const STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'because',
  'could',
  'didnt',
  'doing',
  'during',
  'other',
  'should',
  'their',
  'there',
  'these',
  'thing',
  'think',
  'those',
  'time',
  'told',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'with',
  'would',
  'your',
  'team',
  'work',
  'project',
  'people',
  'something',
  'someone',
]);

function terms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word));
}

const includesAny = (text: string, cues: readonly string[]): boolean =>
  cues.some((cue) => text.includes(cue));

/**
 * True when the question is asking for a story rather than for technical reasoning.
 *
 * A failure or conflict word alone is not enough. "What happens if the lookup fails?" and
 * "Convince me this is O(n)" are coding questions, and treating them as behavioural put
 * two unrelated stories into the answer. Those words now only steer *which* story is
 * picked, once the question is established as asking for one.
 */
export function isBehaviouralQuestion(question: string): boolean {
  const text = question.toLowerCase();
  if (
    /\byour\s+(?:(?:biggest|greatest|hardest|most|challenging|difficult|proudest|recent|professional)\s+)*(?:failure|mistake|challenge|achievement|accomplishment|project|experience|background)\b/.test(
      text,
    )
  )
    return true;
  if (includesAny(text, DIRECT_FRAMES)) return true;
  if (PERSONAL_PAST.test(text)) return true;
  return includesAny(text, NARRATIVE_OPENERS) && includesAny(text, EXPERIENCE_OBJECTS);
}

export interface StoryScore {
  story: ExperienceStory;
  score: number;
  /** Readable reasons, so the UI can show why a story was offered. */
  reasons: string[];
}

/**
 * Scores one story against a question. Weighted so that an explicitly tagged principle or
 * a title match beats an incidental word appearing somewhere in the body text.
 */
export function scoreStory(
  question: string,
  story: ExperienceStory,
  behavioural = isBehaviouralQuestion(question),
): StoryScore {
  const asked = new Set(terms(question));
  const lower = question.toLowerCase();
  const reasons: string[] = [];
  let score = 0;

  const overlap = (text: string): number =>
    [...new Set(terms(text))].filter((word) => asked.has(word)).length;

  const principleHits = story.principles.filter((principle) =>
    terms(principle).some((word) => asked.has(word)),
  );
  if (principleHits.length) {
    score += 3 * principleHits.length;
    reasons.push(`matches ${principleHits.join(', ')}`);
  }

  // The principle the question is really probing, even when it is not named.
  if (behavioural) {
    const probed = inferPrinciples(question).filter(
      (principle) => story.principles.includes(principle) && !principleHits.includes(principle),
    );
    if (probed.length) {
      score += 4 * probed.length;
      reasons.push(`fits ${probed.join(', ')}, which this question probes`);
    }
  }

  const titleHits = overlap(story.title);
  if (titleHits) {
    score += 2.5 * titleHits;
    reasons.push('title matches the question');
  }

  const keywordHits = overlap(story.keywords);
  if (keywordHits) {
    score += 2 * keywordHits;
    reasons.push('keywords match');
  }

  const bodyHits = overlap(`${story.situation} ${story.task} ${story.action} ${story.result}`);
  if (bodyHits) {
    score += Math.min(bodyHits, 6) * 0.5;
    reasons.push('details overlap the question');
  }

  // Only once the question is asking for a story. "Convince me this is O(n)" contains a
  // conflict word but is a coding question, and the bonus alone used to drag a story in.
  if (behavioural) {
    if (story.isFailure && includesAny(lower, FAILURE_CUES)) {
      score += 5;
      reasons.push('a genuine failure, which is what was asked for');
    }
    if (story.isConflict && includesAny(lower, CONFLICT_CUES)) {
      score += 5;
      reasons.push('a disagreement, which is what was asked for');
    }
  }

  return { story, score: Number(score.toFixed(2)), reasons };
}

export interface SelectOptions {
  /** How many stories to offer. Two gives the model a choice without diluting it. */
  limit?: number;
  /** Stories already used this session, deprioritised so rounds do not repeat. */
  usedIds?: readonly string[];
}

/**
 * Picks the stories worth sending. Returns nothing for a question that is not asking for
 * an experience, which is what keeps a coding turn from carrying the whole bank.
 */
export function selectStories(
  question: string,
  stories: readonly ExperienceStory[] | undefined,
  options: SelectOptions = {},
): StoryScore[] {
  const { limit = 2, usedIds = [] } = options;
  // Defensive: this takes stored data, which may predate the story bank entirely.
  if (!stories?.length) return [];

  const behavioural = isBehaviouralQuestion(question);
  if (!behavioural) return [];
  const used = new Set(usedIds);

  const ranked = stories
    .map((story) => scoreStory(question, story, behavioural))
    .map((entry) =>
      // An already-told story is not forbidden, only outranked by a fresh one that fits.
      used.has(entry.story.id)
        ? { ...entry, score: entry.score / 3, reasons: [...entry.reasons, 'already used today'] }
        : entry,
    )
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    // A clear behavioural question with no keyword match still needs something to work
    // from, otherwise the model invents one. Offer the least recently used stories.
    if (!behavioural) return [];
    return stories
      .filter((story) => !used.has(story.id))
      .slice(0, limit)
      .map((story) => ({
        story,
        score: 0,
        reasons: ['no close match; offered as a starting point'],
      }));
  }

  // A passing mention in a technical question should not drag a story in.
  const threshold = behavioural ? 0 : 4;
  return ranked.filter((entry) => entry.score > threshold).slice(0, limit);
}

/** Renders a story for the prompt, omitting parts the user has not filled in. */
export function renderStory(story: ExperienceStory): string {
  const parts: [string, string][] = [
    ['Situation', story.situation],
    ['Task', story.task],
    ['Action', story.action],
    ['Result', story.result],
    ['Learning', story.learning],
  ];
  const body = parts
    .filter(([, value]) => value.trim())
    .map(([label, value]) => `${label}: ${value.trim()}`)
    .join('\n');
  const tags = story.principles.length ? ` (${story.principles.join(', ')})` : '';
  return `${story.title || 'Untitled'}${tags}\n${body}`;
}
