import { settingsSchema, type AppEvent, type DesktopAPI, type Settings } from '../shared/contracts';
const listeners = new Set<(event: AppEvent) => void>();
let demoSettings: Settings = settingsSchema.parse({});
let generation = 0;
const emit = (event: AppEvent) => listeners.forEach((listener) => listener(event));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const example = `Okay, I’d keep this small: the parking lot owns its available spots and active tickets. Allocating a spot should update both together.\n\nFor this single-process example, I’m using a set for available spots and a dictionary for tickets. Entry removes one spot; exit puts it back. An unknown ticket produces a clear error.\n\n**What changes**\n- Add allocation and release operations.\n- Keep the ticket-to-spot mapping in one place.\n- Return a clear result when the lot is full.\n\n\`\`\`python\nfrom uuid import uuid4\n\n\nclass ParkingLot:\n    def __init__(self, capacity: int):\n        if capacity < 1:\n            raise ValueError("Capacity must be positive")\n        self.available = set(range(1, capacity + 1))\n        self.tickets = {}\n\n    def enter(self):\n        if not self.available:\n            return None  # Caller can display a lot-full message.\n        spot = self.available.pop()\n        ticket = str(uuid4())\n        self.tickets[ticket] = spot\n        return ticket, spot\n\n    def exit(self, ticket: str):\n        if ticket not in self.tickets:\n            raise ValueError("Unknown ticket")\n        self.available.add(self.tickets.pop(ticket))\n\`\`\`\n\nEntry and exit are average **O(1)**; storage is **O(capacity)**. I’d test a full lot, repeated exit, and reusing a released spot. Multiple gates would need an atomic allocation operation.`;
export const demoAPI: DesktopAPI = {
  isDesktop: false,
  getSettings: async () => ({ settings: demoSettings, hasKey: false }),
  saveSettings: async (settings) => {
    demoSettings = settingsSchema.parse(settings);
  },
  setKey: async () => {
    throw new Error('Open the Windows desktop app to store an API key.');
  },
  deleteKey: async () => undefined,
  answer: async (request) => {
    const current = ++generation;
    let answer = example;
    if (/disagree|teammate|tell me about a time/i.test(request.question))
      answer =
        'For this story, I’d first pick a real disagreement where you can explain both viewpoints fairly.\n\nWhat was the specific technical decision you and your teammate disagreed about?\n\nOnce you add the facts, we can shape them into a concise STAR answer with a clear result and learning. I won’t invent a project or metric for you.';
    if (/two sum/i.test(request.question))
      answer =
        'For Two Sum, a nested loop takes O(n²) time. We can use a dictionary to remember each number’s index and look for its complement in one pass.\n\n```python\ndef two_sum(nums, target):\n    seen = {}\n    for index, number in enumerate(nums):\n        complement = target - number\n        if complement in seen:\n            return [seen[complement], index]\n        seen[number] = index\n    return []\n```\n\nChecking before storing prevents using the same element twice. This takes O(n) time and O(n) extra space.';
    void (async () => {
      for (let i = 0; i < answer.length; i += 60) {
        await sleep(12);
        if (current !== generation) return;
        emit({ type: 'answer.delta', id: request.id, text: answer.slice(i, i + 60) });
      }
      if (current === generation) emit({ type: 'answer.done', id: request.id, text: answer });
    })();
  },
  cancel: async () => {
    generation++;
  },
  startAudio: async () => {
    throw new Error('Live audio is available in the Windows desktop app.');
  },
  stopAudio: async () => undefined,
  sendAudio: () => undefined,
  onEvent: (callback) => {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  },
  listSessions: async () => [],
  saveSession: async () => undefined,
  deleteSession: async () => undefined,
};
export const desktopAPI = window.desktop ?? demoAPI;
