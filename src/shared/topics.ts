import type { Mode } from './contracts';
import { isBehaviouralQuestion } from './story-bank';

const DSA =
  /\b(?:array|arrays|string|substring|subarray|subsequence|palindrome|anagram|linked\s*list|tree|trees|bst|trie|graph|graphs|node|nodes|edge|edges|heap|priority\s*queue|stack|queue|deque|hash\s*(?:map|set|table)|dictionary|binary\s*search|two\s*pointers?|sliding\s*window|prefix\s*sum|bfs|dfs|breadth|depth|topological|indegree|dijkstra|union\s*find|dynamic\s*programming|\bdp\b|memoi[sz]|recursion|recursive|backtrack\w*|greedy|sort|sorted|sorting|interval|intervals|matrix|grid|leetcode|two\s*sum|three\s*sum|complexity|big\s*o|o\(\s*[n1]|time\s*complexity|space\s*complexity|algorithm|dry\s*run|edge\s*cases?|optimi[sz]e|brute\s*force|k(?:th)?\s*largest|median|permutation|combination|coin\s*change|knapsack|fibonacci|integer|integers|return\s+the|given\s+an?)\b/i;

const LLD =
  /\b(?:design\s+(?:a|an|the)|low[-\s]*level\s*design|\blld\b|object[-\s]*oriented|\boop\b|class(?:es)?|interface|entity|entities|design\s*pattern|singleton|factory|strategy\s*pattern|observer|builder|parking\s*lot|elevator|vending\s*machine|library\s*management|booking|reservation|ride\s*sharing|splitwise|chess|tic[-\s]*tac[-\s]*toe|snake\s*and\s*ladder|lru\s*cache|rate\s*limiter|inventory|cart|locker|atm|hotel|movie\s*ticket|schema|api|apis|requirements?|use\s*cases?|responsibilit\w+)\b/i;

/** Topics signalled directly by one piece of text. Behavioral reuses the story-bank detector. */
export function topicsIn(text: string): Mode[] {
  const found: Mode[] = [];
  if (LLD.test(text)) found.push('lld');
  if (DSA.test(text)) found.push('dsa');
  if (isBehaviouralQuestion(text)) found.push('behavioral');
  return found;
}

/**
 * Decide which guidance sections the current turn needs. The question and pinned context
 * decide first; short follow-ups ("yes", "two exits", "why?") inherit the topics of the
 * most recent turns that had one, so an ongoing design or coding thread keeps its rules.
 * Existing workspace code implies an ongoing coding task. An empty result means a purely
 * conversational turn (greeting, check-in) that needs only the core candidate rules.
 */
export function detectTopics(input: {
  question: string;
  context?: string;
  speechContext?: readonly string[];
  code?: string;
  history: readonly { role: 'user' | 'assistant'; content: string }[];
}): Mode[] {
  const selected = new Set<Mode>(topicsIn(input.question));
  for (const text of input.speechContext?.slice(-3) ?? [])
    topicsIn(text).forEach((t) => selected.add(t));
  if (input.context?.trim()) topicsIn(input.context).forEach((t) => selected.add(t));
  if (!selected.size) {
    // Inherit from the newest turns that carried a topic (user and assistant both count).
    for (const message of [...input.history].reverse().slice(0, 6)) {
      const inherited = topicsIn(message.content.slice(0, 4000));
      if (inherited.length) {
        inherited.forEach((t) => selected.add(t));
        break;
      }
    }
  }
  if (!selected.size && input.code?.trim()) selected.add('dsa');
  return (['lld', 'dsa', 'behavioral'] as const).filter((mode) => selected.has(mode));
}

const HEAVY =
  /\b(?:implement|write|code|coding|solve|solution|optimi[sz]e|complexity|dry\s*run|trace|walk\s*(?:me\s*)?through|debug|bug|fix|revise|refactor|edge\s*cases?|design\s+(?:a|an|the)|approach|prove|why\s+does\s+(?:this|it)\s+work)\b/i;

/**
 * Whether a turn is worth a small amount of reasoning. New technical problems, code
 * generation, traces and fixes benefit; greetings, clarification answers and short
 * conversational follow-ups are answered instantly.
 */
export function needsReasoning(question: string, topics: readonly Mode[]): boolean {
  const technical = topics.includes('dsa') || topics.includes('lld');
  if (!technical) return false;
  const text = question.trim();
  if (text.length > 280) return true; // a pasted or dictated problem statement
  return HEAVY.test(text);
}
