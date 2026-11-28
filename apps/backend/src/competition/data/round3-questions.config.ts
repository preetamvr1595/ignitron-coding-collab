/**
 * IGNITRON 2K26 — Round 3: Python Code Tracing Challenge
 * VERSION 3 — Authoritative question set matching the official question paper.
 *
 * 6 MCQs · 1 Mark Each · 6 Marks Total · No Negative Marking
 * Answer key: Q1=A(207.4), Q2=B(P196), Q3=C(302), Q4=C(0), Q5=C(Syntax Ninjas), Q6=C(T148)
 *
 * NEVER expose correctOptionKey to participant-facing APIs.
 */

export interface Round3QuestionOption {
  key: 'A' | 'B' | 'C' | 'D';
  label: string;
  code?: string;
  explanation?: string;
}

export interface Round3TestCase {
  caseIndex: number;
  name: string;
  stdin: string;
  expectedOutput: string;
  marks?: number;
  isHidden: boolean;
  explanation?: string;
}

export interface Round3QuestionConfig {
  id: string;
  orderNumber: number;
  caseNumber: 1 | 2 | 3;
  caseTitle: string;
  title: string;
  difficulty: 'EASY' | 'MEDIUM' | 'ADVANCED' | 'EXPERT';
  marks: number;
  format: 'SELECT_CODE' | 'WRITE_CODE';
  technology: string;
  concept: string;
  targetDataset: string;
  description: string;
  fixtureDescription?: string;
  fixtureTable?: Record<string, any>[];
  options: Round3QuestionOption[];
  correctOptionKey: 'A' | 'B' | 'C' | 'D';
  isCompulsoryRepair: boolean;
  starterCode: string;
  sampleTestCases: Round3TestCase[];
  hiddenTestCases: Round3TestCase[];
}

export const ROUND3_CODE_QUALITY_RUBRIC = {
  totalMarks: 0,
  criteria: [],
};

export const ROUND3_QUESTIONS_CONFIG: Round3QuestionConfig[] = [
  // ============================================================
  // CASE 01 – DATA FUNDAMENTALS   (2 questions · 2 marks)
  // ============================================================
  {
    id: 'R3_Q1_TOTAL_SCORE_P101',
    orderNumber: 1,
    caseNumber: 1,
    caseTitle: 'Case 01 – Data Fundamentals',
    title: 'Q1. Calculate Total Score',
    difficulty: 'EASY',
    marks: 1,
    format: 'SELECT_CODE',
    technology: 'Python',
    concept: 'List sum aggregation',
    targetDataset: 'participants.csv',
    description: `Participant P101 (Akash Patel) has the following scores:
• Round 1: 25.4
• Round 2: 87.4
• Round 3: 94.6

Which code correctly calculates the total score?`,
    fixtureDescription: 'Scores list for P101 (Akash Patel)',
    options: [
      {
        key: 'A',
        label: 'Option A',
        code: `scores = [25.4, 87.4, 94.6]
print(sum(scores))
# Output: 207.4`,
        explanation: 'Correct. sum() adds 25.4 + 87.4 + 94.6 = 207.4.',
      },
      {
        key: 'B',
        label: 'Option B',
        code: `scores = [25.4, 87.4, 94.6]
print(max(scores))
# Output: 94.6`,
        explanation: 'Incorrect. max() returns the largest element (94.6), not the total.',
      },
      {
        key: 'C',
        label: 'Option C',
        code: `scores = [25.4, 87.4, 94.6]
print(len(scores))
# Output: 3`,
        explanation: 'Incorrect. len() returns the number of elements (3), not the total.',
      },
      {
        key: 'D',
        label: 'Option D',
        code: `scores = [25.4, 87.4, 94.6]
print(sum(scores) / 3)
# Output: 69.13333333333333`,
        explanation: 'Incorrect. Dividing by 3 gives the average, not the total.',
      },
    ],
    correctOptionKey: 'A',
    isCompulsoryRepair: false,
    starterCode: '',
    sampleTestCases: [],
    hiddenTestCases: [],
  },
  {
    id: 'R3_Q2_HIGHEST_PARTICIPANT',
    orderNumber: 2,
    caseNumber: 1,
    caseTitle: 'Case 01 – Data Fundamentals',
    title: 'Q2. Find the Highest-Scoring Participant',
    difficulty: 'EASY',
    marks: 1,
    format: 'SELECT_CODE',
    technology: 'Python',
    concept: 'max() with key on dict',
    targetDataset: 'participants.csv',
    description: `The total scores of four participants are given below.

Which code correctly finds the participant with the highest score?`,
    fixtureDescription: 'Participant scores dictionary',
    fixtureTable: [
      { participant: 'P101', total_score: 207.4 },
      { participant: 'P170', total_score: 216.1 },
      { participant: 'P185', total_score: 208.9 },
      { participant: 'P196', total_score: 217.2 },
    ],
    options: [
      {
        key: 'A',
        label: 'Option A',
        code: `scores = {
    "P101": 207.4,
    "P170": 216.1,
    "P185": 208.9,
    "P196": 217.2
}
print(min(scores, key=scores.get))
# Output: P101`,
        explanation: 'Incorrect. min() returns the participant with the lowest score (P101).',
      },
      {
        key: 'B',
        label: 'Option B',
        code: `scores = {
    "P101": 207.4,
    "P170": 216.1,
    "P185": 208.9,
    "P196": 217.2
}
print(max(scores, key=scores.get))
# Output: P196`,
        explanation: 'Correct. max(scores, key=scores.get) returns the key with the highest value: P196 (217.2).',
      },
      {
        key: 'C',
        label: 'Option C',
        code: `scores = {
    "P101": 207.4,
    "P170": 216.1,
    "P185": 208.9,
    "P196": 217.2
}
print(max(scores.values()))
# Output: 217.2`,
        explanation: 'Incorrect. max(scores.values()) returns the highest score value (217.2), not the participant ID.',
      },
      {
        key: 'D',
        label: 'Option D',
        code: `scores = {
    "P101": 207.4,
    "P170": 216.1,
    "P185": 208.9,
    "P196": 217.2
}
print(sum(scores.values()))
# Output: 849.6`,
        explanation: 'Incorrect. sum() returns the total of all scores (849.6), not the top participant.',
      },
    ],
    correctOptionKey: 'B',
    isCompulsoryRepair: false,
    starterCode: '',
    sampleTestCases: [],
    hiddenTestCases: [],
  },

  // ============================================================
  // CASE 02 – DATA INTEGRITY   (2 questions · 2 marks)
  // ============================================================
  {
    id: 'R3_Q3_COUNT_ACCEPTED',
    orderNumber: 3,
    caseNumber: 2,
    caseTitle: 'Case 02 – Data Integrity',
    title: 'Q3. Count Accepted Submissions',
    difficulty: 'EASY',
    marks: 1,
    format: 'SELECT_CODE',
    technology: 'Python',
    concept: 'Dictionary lookup by key',
    targetDataset: 'submission_status_summary.csv',
    description: `The dataset contains 1,000 submission records, including 302 ACCEPTED submissions.

Which code correctly prints the number of accepted submissions?`,
    fixtureDescription: 'Submission status count dictionary',
    fixtureTable: [
      { status: 'ACCEPTED', count: 302 },
      { status: 'WRONG_ANSWER', count: 192 },
    ],
    options: [
      {
        key: 'A',
        label: 'Option A',
        code: `status_count = {
    "ACCEPTED": 302,
    "WRONG_ANSWER": 192
}
print(status_count["WRONG_ANSWER"])
# Output: 192`,
        explanation: 'Incorrect. Looks up WRONG_ANSWER (192) instead of ACCEPTED.',
      },
      {
        key: 'B',
        label: 'Option B',
        code: `status_count = {
    "ACCEPTED": 302,
    "WRONG_ANSWER": 192
}
print(len(status_count))
# Output: 2`,
        explanation: 'Incorrect. len() counts the number of keys in the dict (2), not the ACCEPTED count.',
      },
      {
        key: 'C',
        label: 'Option C',
        code: `status_count = {
    "ACCEPTED": 302,
    "WRONG_ANSWER": 192
}
print(status_count["ACCEPTED"])
# Output: 302`,
        explanation: 'Correct. Directly accesses the "ACCEPTED" key and prints 302.',
      },
      {
        key: 'D',
        label: 'Option D',
        code: `status_count = {
    "ACCEPTED": 302,
    "WRONG_ANSWER": 192
}
print(sum(status_count.values()))
# Output: 494`,
        explanation: 'Incorrect. sum() adds 302 + 192 = 494, not just the ACCEPTED count.',
      },
    ],
    correctOptionKey: 'C',
    isCompulsoryRepair: false,
    starterCode: '',
    sampleTestCases: [],
    hiddenTestCases: [],
  },
  {
    id: 'R3_Q4_DUPLICATE_SUBMISSION_IDS',
    orderNumber: 4,
    caseNumber: 2,
    caseTitle: 'Case 02 – Data Integrity',
    title: 'Q4. Identify Duplicate Submission IDs',
    difficulty: 'EASY',
    marks: 1,
    format: 'SELECT_CODE',
    technology: 'Python',
    concept: 'Set-based duplicate detection',
    targetDataset: 'submission_ids.csv',
    description: `The dataset contains 1,000 submission records and no duplicate submission IDs.

Which code correctly calculates the number of duplicate IDs?`,
    fixtureDescription: 'Sample submission IDs list',
    fixtureTable: [
      { submission_id: 'SUB1' },
      { submission_id: 'SUB2' },
      { submission_id: 'SUB3' },
      { submission_id: 'SUB4' },
    ],
    options: [
      {
        key: 'A',
        label: 'Option A',
        code: `ids = ["SUB1", "SUB2", "SUB3", "SUB4"]
print(len(ids))
# Output: 4`,
        explanation: 'Incorrect. len(ids) counts all elements (4), not duplicates.',
      },
      {
        key: 'B',
        label: 'Option B',
        code: `ids = ["SUB1", "SUB2", "SUB3", "SUB4"]
print(len(set(ids)))
# Output: 4`,
        explanation: 'Incorrect. len(set(ids)) gives the number of unique IDs (4), not the duplicate count.',
      },
      {
        key: 'C',
        label: 'Option C',
        code: `ids = ["SUB1", "SUB2", "SUB3", "SUB4"]
print(len(ids) - len(set(ids)))
# Output: 0`,
        explanation: 'Correct. len(ids) - len(set(ids)) = 4 - 4 = 0 duplicates.',
      },
      {
        key: 'D',
        label: 'Option D',
        code: `ids = ["SUB1", "SUB2", "SUB3", "SUB4"]
print(len(ids) + len(set(ids)))
# Output: 8`,
        explanation: 'Incorrect. Adding 4 + 4 = 8 has no meaningful interpretation.',
      },
    ],
    correctOptionKey: 'C',
    isCompulsoryRepair: false,
    starterCode: '',
    sampleTestCases: [],
    hiddenTestCases: [],
  },

  // ============================================================
  // CASE 03 – ANALYTICAL INTELLIGENCE   (2 questions · 2 marks)
  // ============================================================
  {
    id: 'R3_Q5_HIGHEST_RANKED_TEAM',
    orderNumber: 5,
    caseNumber: 3,
    caseTitle: 'Case 03 – Analytical Intelligence',
    title: 'Q5. Find the Highest-Ranked Team',
    difficulty: 'MEDIUM',
    marks: 1,
    format: 'SELECT_CODE',
    technology: 'Python',
    concept: 'max() with key on dict',
    targetDataset: 'team_leaderboard.csv',
    description: `Which code correctly finds the team with the highest total score?`,
    fixtureDescription: 'Team total scores dictionary',
    fixtureTable: [
      { team: 'Syntax Ninjas', total_score: 425.6 },
      { team: 'Recursion Crusaders', total_score: 402.6 },
      { team: 'Code Architects', total_score: 388.9 },
      { team: 'Omega Wolves', total_score: 384.8 },
    ],
    options: [
      {
        key: 'A',
        label: 'Option A',
        code: `teams = {
    "Syntax Ninjas": 425.6,
    "Recursion Crusaders": 402.6,
    "Code Architects": 388.9,
    "Omega Wolves": 384.8
}
print(min(teams, key=teams.get))
# Output: Omega Wolves`,
        explanation: 'Incorrect. min() returns the team with the lowest score (Omega Wolves).',
      },
      {
        key: 'B',
        label: 'Option B',
        code: `teams = {
    "Syntax Ninjas": 425.6,
    "Recursion Crusaders": 402.6,
    "Code Architects": 388.9,
    "Omega Wolves": 384.8
}
print(max(teams.values()))
# Output: 425.6`,
        explanation: 'Incorrect. max(teams.values()) returns the highest score value (425.6), not the team name.',
      },
      {
        key: 'C',
        label: 'Option C',
        code: `teams = {
    "Syntax Ninjas": 425.6,
    "Recursion Crusaders": 402.6,
    "Code Architects": 388.9,
    "Omega Wolves": 384.8
}
print(max(teams, key=teams.get))
# Output: Syntax Ninjas`,
        explanation: 'Correct. max(teams, key=teams.get) returns the key with the highest value: Syntax Ninjas (425.6).',
      },
      {
        key: 'D',
        label: 'Option D',
        code: `teams = {
    "Syntax Ninjas": 425.6,
    "Recursion Crusaders": 402.6,
    "Code Architects": 388.9,
    "Omega Wolves": 384.8
}
print(sum(teams.values()))
# Output: 1601.9`,
        explanation: 'Incorrect. sum() returns the total of all team scores (1601.9).',
      },
    ],
    correctOptionKey: 'C',
    isCompulsoryRepair: false,
    starterCode: '',
    sampleTestCases: [],
    hiddenTestCases: [],
  },
  {
    id: 'R3_Q6_APPLY_TEAM_RANKING',
    orderNumber: 6,
    caseNumber: 3,
    caseTitle: 'Case 03 – Analytical Intelligence',
    title: 'Q6. Apply Team Ranking',
    difficulty: 'MEDIUM',
    marks: 1,
    format: 'SELECT_CODE',
    technology: 'Python',
    concept: 'Sort with reverse=True on tuple list',
    targetDataset: 'team_round_scores.csv',
    description: `The records contain team ID, total score, Round 3 score and Round 2 score.

Which code correctly sorts teams by total score in descending order?`,
    fixtureDescription: 'Teams as list of tuples: (team_id, total, round3, round2)',
    fixtureTable: [
      { team_id: 'T148', total_score: 425.6, round3_score: 176.7, round2_score: 197.9 },
      { team_id: 'T147', total_score: 402.6, round3_score: 172.0, round2_score: 179.3 },
      { team_id: 'T118', total_score: 388.9, round3_score: 180.6, round2_score: 161.4 },
    ],
    options: [
      {
        key: 'A',
        label: 'Option A',
        code: `teams = [
    ("T148", 425.6, 176.7, 197.9),
    ("T147", 402.6, 172.0, 179.3),
    ("T118", 388.9, 180.6, 161.4)
]
teams.sort(key=lambda x: x[1])
print(teams[0][0])
# Output: T118`,
        explanation: 'Incorrect. Without reverse=True, sort is ascending; teams[0] is the lowest-scoring team (T118).',
      },
      {
        key: 'B',
        label: 'Option B',
        code: `teams = [
    ("T148", 425.6, 176.7, 197.9),
    ("T147", 402.6, 172.0, 179.3),
    ("T118", 388.9, 180.6, 161.4)
]
teams.sort(key=lambda x: x[2], reverse=True)
print(teams[0][0])
# Output: T118`,
        explanation: 'Incorrect. Sorting by x[2] (round3 score) puts T118 (180.6) first, not T148.',
      },
      {
        key: 'C',
        label: 'Option C',
        code: `teams = [
    ("T148", 425.6, 176.7, 197.9),
    ("T147", 402.6, 172.0, 179.3),
    ("T118", 388.9, 180.6, 161.4)
]
teams.sort(key=lambda x: x[1], reverse=True)
print(teams[0][0])
# Output: T148`,
        explanation: 'Correct. Sorts by total score (x[1]) descending; T148 (425.6) is at index 0.',
      },
      {
        key: 'D',
        label: 'Option D',
        code: `teams = [
    ("T148", 425.6, 176.7, 197.9),
    ("T147", 402.6, 172.0, 179.3),
    ("T118", 388.9, 180.6, 161.4)
]
teams.sort(key=lambda x: x[3])
print(teams[0][0])
# Output: T118`,
        explanation: 'Incorrect. Sorting by x[3] (round2 score) ascending puts T118 first.',
      },
    ],
    correctOptionKey: 'C',
    isCompulsoryRepair: false,
    starterCode: '',
    sampleTestCases: [],
    hiddenTestCases: [],
  },
];
