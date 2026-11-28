// One-time script: force-update Round 3 question options to match official question paper v3.
// Run once: node apps/backend/src/competition/data/scratch-force-update-r3.mjs
// Delete after use.
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const UPDATES = [
  {
    id: 'cmx0doued0001fej4cp143the',
    title: 'Q1. Calculate Total Score',
    description: 'Participant P101 (Akash Patel) has the following scores:\n• Round 1: 25.4\n• Round 2: 87.4\n• Round 3: 94.6\n\nWhich code correctly calculates the total score?',
    caseNumber: 1,
    correctOption: 0,
    rubric: { difficulty: 'EASY', technology: 'Python', concept: 'List sum aggregation', format: 'SELECT_CODE', correctOptionKey: 'A', caseTitle: 'Case 01 – Data Fundamentals' },
    options: [
      { key: 'A', label: 'Option A', code: 'scores = [25.4, 87.4, 94.6]\nprint(sum(scores))\n# Output: 207.4', explanation: 'Correct. sum() adds 25.4 + 87.4 + 94.6 = 207.4.' },
      { key: 'B', label: 'Option B', code: 'scores = [25.4, 87.4, 94.6]\nprint(max(scores))\n# Output: 94.6', explanation: 'Incorrect. max() returns the largest element (94.6), not the total.' },
      { key: 'C', label: 'Option C', code: 'scores = [25.4, 87.4, 94.6]\nprint(len(scores))\n# Output: 3', explanation: 'Incorrect. len() returns the number of elements (3), not the total.' },
      { key: 'D', label: 'Option D', code: 'scores = [25.4, 87.4, 94.6]\nprint(sum(scores) / 3)\n# Output: 69.13333333333333', explanation: 'Incorrect. Dividing by 3 gives the average, not the total.' },
    ],
  },
  {
    id: 'cmx0douem0003fej4lgbkgd70',
    title: 'Q2. Find the Highest-Scoring Participant',
    description: 'The total scores of four participants are given below.\n\nWhich code correctly finds the participant with the highest score?',
    caseNumber: 1,
    correctOption: 1,
    rubric: { difficulty: 'EASY', technology: 'Python', concept: 'max() with key on dict', format: 'SELECT_CODE', correctOptionKey: 'B', caseTitle: 'Case 01 – Data Fundamentals' },
    options: [
      { key: 'A', label: 'Option A', code: 'scores = {\n    "P101": 207.4,\n    "P170": 216.1,\n    "P185": 208.9,\n    "P196": 217.2\n}\nprint(min(scores, key=scores.get))\n# Output: P101', explanation: 'Incorrect. min() returns the participant with the lowest score (P101).' },
      { key: 'B', label: 'Option B', code: 'scores = {\n    "P101": 207.4,\n    "P170": 216.1,\n    "P185": 208.9,\n    "P196": 217.2\n}\nprint(max(scores, key=scores.get))\n# Output: P196', explanation: 'Correct. max(scores, key=scores.get) returns the key with the highest value: P196 (217.2).' },
      { key: 'C', label: 'Option C', code: 'scores = {\n    "P101": 207.4,\n    "P170": 216.1,\n    "P185": 208.9,\n    "P196": 217.2\n}\nprint(max(scores.values()))\n# Output: 217.2', explanation: 'Incorrect. max(scores.values()) returns the highest score value (217.2), not the participant ID.' },
      { key: 'D', label: 'Option D', code: 'scores = {\n    "P101": 207.4,\n    "P170": 216.1,\n    "P185": 208.9,\n    "P196": 217.2\n}\nprint(sum(scores.values()))\n# Output: 849.6', explanation: 'Incorrect. sum() returns the total of all scores (849.6), not the top participant.' },
    ],
  },
  {
    id: 'cmx0doueu0005fej4ird1znyy',
    title: 'Q3. Count Accepted Submissions',
    description: 'The dataset contains 1,000 submission records, including 302 ACCEPTED submissions.\n\nWhich code correctly prints the number of accepted submissions?',
    caseNumber: 2,
    correctOption: 2,
    rubric: { difficulty: 'EASY', technology: 'Python', concept: 'Dictionary lookup by key', format: 'SELECT_CODE', correctOptionKey: 'C', caseTitle: 'Case 02 – Data Integrity' },
    options: [
      { key: 'A', label: 'Option A', code: 'status_count = {\n    "ACCEPTED": 302,\n    "WRONG_ANSWER": 192\n}\nprint(status_count["WRONG_ANSWER"])\n# Output: 192', explanation: 'Incorrect. Looks up WRONG_ANSWER (192) instead of ACCEPTED.' },
      { key: 'B', label: 'Option B', code: 'status_count = {\n    "ACCEPTED": 302,\n    "WRONG_ANSWER": 192\n}\nprint(len(status_count))\n# Output: 2', explanation: 'Incorrect. len() counts the number of keys in the dict (2), not the ACCEPTED count.' },
      { key: 'C', label: 'Option C', code: 'status_count = {\n    "ACCEPTED": 302,\n    "WRONG_ANSWER": 192\n}\nprint(status_count["ACCEPTED"])\n# Output: 302', explanation: 'Correct. Directly accesses the "ACCEPTED" key and prints 302.' },
      { key: 'D', label: 'Option D', code: 'status_count = {\n    "ACCEPTED": 302,\n    "WRONG_ANSWER": 192\n}\nprint(sum(status_count.values()))\n# Output: 494', explanation: 'Incorrect. sum() adds 302 + 192 = 494, not just the ACCEPTED count.' },
    ],
  },
  {
    id: 'cmx0douf40007fej4a55wsonw',
    title: 'Q4. Identify Duplicate Submission IDs',
    description: 'The dataset contains 1,000 submission records and no duplicate submission IDs.\n\nWhich code correctly calculates the number of duplicate IDs?',
    caseNumber: 2,
    correctOption: 2,
    rubric: { difficulty: 'EASY', technology: 'Python', concept: 'Set-based duplicate detection', format: 'SELECT_CODE', correctOptionKey: 'C', caseTitle: 'Case 02 – Data Integrity' },
    options: [
      { key: 'A', label: 'Option A', code: 'ids = ["SUB1", "SUB2", "SUB3", "SUB4"]\nprint(len(ids))\n# Output: 4', explanation: 'Incorrect. len(ids) counts all elements (4), not duplicates.' },
      { key: 'B', label: 'Option B', code: 'ids = ["SUB1", "SUB2", "SUB3", "SUB4"]\nprint(len(set(ids)))\n# Output: 4', explanation: 'Incorrect. len(set(ids)) gives the number of unique IDs (4), not the duplicate count.' },
      { key: 'C', label: 'Option C', code: 'ids = ["SUB1", "SUB2", "SUB3", "SUB4"]\nprint(len(ids) - len(set(ids)))\n# Output: 0', explanation: 'Correct. len(ids) - len(set(ids)) = 4 - 4 = 0 duplicates.' },
      { key: 'D', label: 'Option D', code: 'ids = ["SUB1", "SUB2", "SUB3", "SUB4"]\nprint(len(ids) + len(set(ids)))\n# Output: 8', explanation: 'Incorrect. Adding 4 + 4 = 8 has no meaningful interpretation.' },
    ],
  },
  {
    id: 'cmx0douff0009fej4f88dke35',
    title: 'Q5. Find the Highest-Ranked Team',
    description: 'Which code correctly finds the team with the highest total score?',
    caseNumber: 3,
    correctOption: 2,
    rubric: { difficulty: 'MEDIUM', technology: 'Python', concept: 'max() with key on dict', format: 'SELECT_CODE', correctOptionKey: 'C', caseTitle: 'Case 03 – Analytical Intelligence' },
    options: [
      { key: 'A', label: 'Option A', code: 'teams = {\n    "Syntax Ninjas": 425.6,\n    "Recursion Crusaders": 402.6,\n    "Code Architects": 388.9,\n    "Omega Wolves": 384.8\n}\nprint(min(teams, key=teams.get))\n# Output: Omega Wolves', explanation: 'Incorrect. min() returns the team with the lowest score (Omega Wolves).' },
      { key: 'B', label: 'Option B', code: 'teams = {\n    "Syntax Ninjas": 425.6,\n    "Recursion Crusaders": 402.6,\n    "Code Architects": 388.9,\n    "Omega Wolves": 384.8\n}\nprint(max(teams.values()))\n# Output: 425.6', explanation: 'Incorrect. max(teams.values()) returns the highest score value (425.6), not the team name.' },
      { key: 'C', label: 'Option C', code: 'teams = {\n    "Syntax Ninjas": 425.6,\n    "Recursion Crusaders": 402.6,\n    "Code Architects": 388.9,\n    "Omega Wolves": 384.8\n}\nprint(max(teams, key=teams.get))\n# Output: Syntax Ninjas', explanation: 'Correct. max(teams, key=teams.get) returns the key with the highest value: Syntax Ninjas (425.6).' },
      { key: 'D', label: 'Option D', code: 'teams = {\n    "Syntax Ninjas": 425.6,\n    "Recursion Crusaders": 402.6,\n    "Code Architects": 388.9,\n    "Omega Wolves": 384.8\n}\nprint(sum(teams.values()))\n# Output: 1601.9', explanation: 'Incorrect. sum() returns the total of all team scores (1601.9).' },
    ],
  },
  {
    id: 'cmx0doufs000bfej447axxo7j',
    title: 'Q6. Apply Team Ranking',
    description: 'The records contain team ID, total score, Round 3 score and Round 2 score.\n\nWhich code correctly sorts teams by total score in descending order?',
    caseNumber: 3,
    correctOption: 2,
    rubric: { difficulty: 'MEDIUM', technology: 'Python', concept: 'Sort with reverse=True on tuple list', format: 'SELECT_CODE', correctOptionKey: 'C', caseTitle: 'Case 03 – Analytical Intelligence' },
    options: [
      { key: 'A', label: 'Option A', code: 'teams = [\n    ("T148", 425.6, 176.7, 197.9),\n    ("T147", 402.6, 172.0, 179.3),\n    ("T118", 388.9, 180.6, 161.4)\n]\nteams.sort(key=lambda x: x[1])\nprint(teams[0][0])\n# Output: T118', explanation: 'Incorrect. Without reverse=True, sort is ascending; teams[0] is the lowest-scoring team (T118).' },
      { key: 'B', label: 'Option B', code: 'teams = [\n    ("T148", 425.6, 176.7, 197.9),\n    ("T147", 402.6, 172.0, 179.3),\n    ("T118", 388.9, 180.6, 161.4)\n]\nteams.sort(key=lambda x: x[2], reverse=True)\nprint(teams[0][0])\n# Output: T118', explanation: 'Incorrect. Sorting by x[2] (round3 score) puts T118 (180.6) first, not T148.' },
      { key: 'C', label: 'Option C', code: 'teams = [\n    ("T148", 425.6, 176.7, 197.9),\n    ("T147", 402.6, 172.0, 179.3),\n    ("T118", 388.9, 180.6, 161.4)\n]\nteams.sort(key=lambda x: x[1], reverse=True)\nprint(teams[0][0])\n# Output: T148', explanation: 'Correct. Sorts by total score (x[1]) descending; T148 (425.6) is at index 0.' },
      { key: 'D', label: 'Option D', code: 'teams = [\n    ("T148", 425.6, 176.7, 197.9),\n    ("T147", 402.6, 172.0, 179.3),\n    ("T118", 388.9, 180.6, 161.4)\n]\nteams.sort(key=lambda x: x[3])\nprint(teams[0][0])\n# Output: T118', explanation: 'Incorrect. Sorting by x[3] (round2 score) ascending puts T118 first.' },
    ],
  },
];

async function run() {
  for (const q of UPDATES) {
    await p.question.update({
      where: { id: q.id },
      data: {
        title: q.title,
        description: q.description,
        caseNumber: q.caseNumber,
        options: q.options,
        correctOption: q.correctOption,
        rubric: q.rubric,
        isActive: true,
      },
    });
    console.log(`✓ Updated ${q.id}: ${q.title}`);
  }
  console.log('\n✅ All 6 Round 3 questions updated with official options.');
}

run().catch((e) => { console.error('ERROR:', e.message); process.exit(1); }).finally(() => p.$disconnect());
