/**
 * IGNITRON 2K26 — Round 1: Technical Quiz (MCQ Arena)
 * Authoritative 15-question set · 2 Marks Each · 30 Marks Total · No Negative Marking
 *
 * Answer Key (Backend / Admin Only — NEVER expose to participant APIs):
 * Q1=C, Q2=C, Q3=B, Q4=C, Q5=B, Q6=B, Q7=C, Q8=B, Q9=C, Q10=A, Q11=B, Q12=B, Q13=C, Q14=A, Q15=B
 */

export interface Round1QuestionConfig {
  orderNumber: number;
  title: string;
  description: string;
  options: [string, string, string, string];
  correctOption: 0 | 1 | 2 | 3; // 0=A, 1=B, 2=C, 3=D
  explanation: string;
}

export const ROUND1_QUESTIONS_CONFIG: Round1QuestionConfig[] = [
  {
    orderNumber: 1,
    title: 'SQL Table Record Removal',
    description: 'Which SQL command removes all records from a table while keeping its structure?',
    options: ['DROP', 'DELETE', 'TRUNCATE', 'UPDATE'],
    correctOption: 2, // C
    explanation: 'TRUNCATE removes all rows from a table quickly while preserving the table schema and structure.',
  },
  {
    orderNumber: 2,
    title: 'Default HTTPS Port',
    description: 'What is the default port number of HTTPS?',
    options: ['21', '80', '443', '8080'],
    correctOption: 2, // C
    explanation: 'HTTPS uses TCP port 443 by default (whereas HTTP uses 80 and FTP uses 21).',
  },
  {
    orderNumber: 3,
    title: 'FIFO Data Structure',
    description: 'Which data structure follows FIFO (First In, First Out)?',
    options: ['Stack', 'Queue', 'Tree', 'Graph'],
    correctOption: 1, // B
    explanation: 'A Queue processes elements in First In, First Out (FIFO) order.',
  },
  {
    orderNumber: 4,
    title: 'Python Function Keyword',
    description: 'Which keyword is used to define a function in Python?',
    options: ['function', 'define', 'def', 'fun'],
    correctOption: 2, // C
    explanation: 'In Python, functions are defined using the def keyword.',
  },
  {
    orderNumber: 5,
    title: 'Git Remote Upload Command',
    description: 'Which Git command uploads local commits to a remote repository?',
    options: ['git pull', 'git push', 'git init', 'git status'],
    correctOption: 1, // B
    explanation: 'git push uploads local branch commits to the configured remote repository.',
  },
  {
    orderNumber: 6,
    title: 'Purpose of a Foreign Key',
    description: 'What is the main purpose of a foreign key in a database?',
    options: [
      'To encrypt records',
      'To connect related tables',
      'To delete duplicate records',
      'To sort table data',
    ],
    correctOption: 1, // B
    explanation: 'A foreign key establishes and enforces a relational link between rows in two tables.',
  },
  {
    orderNumber: 7,
    title: 'HTML Hyperlink Tag',
    description: 'Which HTML tag creates a hyperlink?',
    options: ['<link>', '<href>', '<a>', '<url>'],
    correctOption: 2, // C
    explanation: 'The HTML <a> (anchor) tag defines a hyperlink using its href attribute.',
  },
  {
    orderNumber: 8,
    title: 'JavaScript Web Framework',
    description: 'Which is a JavaScript framework commonly used for building web applications?',
    options: ['Django', 'Angular', 'Flask', 'Laravel'],
    correctOption: 1, // B
    explanation: 'Angular is a TypeScript/JavaScript web application framework; Django/Flask are Python and Laravel is PHP.',
  },
  {
    orderNumber: 9,
    title: 'Linux Working Directory Command',
    description: 'Which Linux command displays the current working directory?',
    options: ['ls', 'cd', 'pwd', 'mkdir'],
    correctOption: 2, // C
    explanation: 'pwd (print working directory) outputs the full path of the current directory.',
  },
  {
    orderNumber: 10,
    title: 'File Transfer Protocol',
    description: 'Which protocol is commonly used to transfer files between computers over a network?',
    options: ['FTP', 'HTTP', 'SMTP', 'DNS'],
    correctOption: 0, // A
    explanation: 'FTP (File Transfer Protocol) is designed specifically for transferring files over a network.',
  },
  {
    orderNumber: 11,
    title: 'Main Purpose of Docker',
    description: 'What is the main purpose of Docker?',
    options: [
      'Database management',
      'Containerization',
      'Image editing',
      'Version control',
    ],
    correctOption: 1, // B
    explanation: 'Docker packages applications and their dependencies into lightweight, portable containers.',
  },
  {
    orderNumber: 12,
    title: 'Data Structure Behind Recursion',
    description: 'Which data structure is commonly used internally to implement recursion?',
    options: ['Queue', 'Stack', 'Graph', 'Hash Table'],
    correctOption: 1, // B
    explanation: 'Recursive function calls are managed using the call Stack (LIFO).',
  },
  {
    orderNumber: 13,
    title: 'HTTP Not Found Status Code',
    description: 'Which HTTP status code represents "Not Found"?',
    options: ['200', '301', '404', '500'],
    correctOption: 2, // C
    explanation: 'HTTP 404 indicates that the requested resource could not be found on the server.',
  },
  {
    orderNumber: 14,
    title: 'Python Data Analysis Library',
    description: 'Which Python library is commonly used for data analysis?',
    options: ['Pandas', 'Pygame', 'Tkinter', 'Turtle'],
    correctOption: 0, // A
    explanation: 'Pandas provides DataFrames and high-level tools for data manipulation and analysis.',
  },
  {
    orderNumber: 15,
    title: 'git fetch vs git pull',
    description: 'What is the difference between `git fetch` and `git pull`?',
    options: [
      'Both commands delete remote repositories.',
      'Fetch downloads remote changes, while pull downloads and integrates them.',
      'Fetch uploads changes, while pull downloads changes.',
      'Both commands create new branches.',
    ],
    correctOption: 1, // B
    explanation: 'git fetch downloads remote commits/refs without merging, whereas git pull fetches and immediately merges/integrates them.',
  },
];
