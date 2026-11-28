import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../database/prisma.service';
import { Judge0ClientService } from '../code-execution/judge0-client.service';
import { ArenaService } from './arena.service';
import {
  AuthTeamUser,
  AnalyticsArenaStateDto,
  AnalyticsQuestionDto,
  DatasetMetaDto,
  DatasetFileMetaDto,
  SaveAnalyticsDraftDto,
  SelectAnalyticsOptionDto,
  SubmitAnalyticsQuestionDto,
  AnalyticsSubmissionResultDto,
  AnalyticsTestCaseResultDto,
} from '@ignitron/shared';
import {
  ROUND3_QUESTIONS_CONFIG,
  Round3QuestionConfig,
  ROUND3_CODE_QUALITY_RUBRIC,
} from './data/round3-questions.config';

function resolveDatasetDir(): string {
  const candidates = [
    path.resolve(__dirname, './data/round3_reference_dataset_v2'),
    path.resolve(__dirname, '../../src/competition/data/round3_reference_dataset_v2'),
    path.resolve(process.cwd(), 'apps/backend/src/competition/data/round3_reference_dataset_v2'),
    path.resolve(process.cwd(), 'src/competition/data/round3_reference_dataset_v2'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }
  return candidates[0];
}

const DATASET_DIR = resolveDatasetDir();

const DATASET_FILES_INFO: Record<string, { title: string; description: string }> = {
  'participants.csv': {
    title: 'Participant Scores (100 Records)',
    description: 'Participant IDs, names, and Round 1, Round 2, Round 3, and total scores across all 100 contestants.',
  },
  'submission_ids.csv': {
    title: 'Submission IDs Audit (1,000 Records)',
    description: 'Complete list of 1,000 submission identifiers (SUB_10001 to SUB_11000) for duplicate detection.',
  },
  'submission_status_summary.csv': {
    title: 'Submission Status Summary (5 Records)',
    description: 'Aggregated counts across ACCEPTED, COMPILATION_ERROR, RUNTIME_ERROR, TIME_LIMIT_EXCEEDED, and WRONG_ANSWER.',
  },
  'team_leaderboard.csv': {
    title: 'Team Leaderboard (50 Records)',
    description: 'Ranked standings for all 50 teams with department, member count, round scores, and total_score.',
  },
  'team_round_scores.csv': {
    title: 'Team Round Scores (50 Records)',
    description: 'Per-team total_score, round_2_score, and round_3_score for multi-key ranking verification.',
  },
  'verification_summary.csv': {
    title: 'Verification Summary (10 Metrics)',
    description: 'Official ground-truth verification metrics matching IGNITRON_Round3_Reference_Dataset.json.',
  },
};

@Injectable()
export class EventAnalyticsService implements OnModuleInit {
  private readonly logger = new Logger(EventAnalyticsService.name);
  private cachedDatasetMeta: DatasetMetaDto | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly judge0Client: Judge0ClientService,
    private readonly arenaService: ArenaService,
  ) {}

  async onModuleInit() {
    try {
      await this.syncOfficialRound3Questions();
    } catch (err: any) {
      this.logger.error(`Failed to sync official Round 3 questions: ${err?.message}`, err?.stack);
    }
  }

  // ============================================================================
  // QUESTION SYNCHRONIZATION
  // ============================================================================

  async syncOfficialRound3Questions() {
    const round3 = await this.prisma.competitionRound.findFirst({
      where: { roundNumber: 3 },
    });

    if (!round3) {
      this.logger.warn('Round 3 not found in competition_rounds table; skipping question sync.');
      return;
    }

    this.logger.log(`Syncing ${ROUND3_QUESTIONS_CONFIG.length} official Round 3 Python Code Tracing Challenge questions...`);

    const activeTitles = ROUND3_QUESTIONS_CONFIG.map((q) => q.title);
    const activeOrderNumbers = ROUND3_QUESTIONS_CONFIG.map((q) => q.orderNumber);

    // Deactivate any Round 3 question whose title AND orderNumber are both not in the active set
    const legacyQuestions = await this.prisma.question.findMany({
      where: {
        roundId: round3.id,
        title: { notIn: activeTitles },
        orderNumber: { notIn: activeOrderNumbers },
      },
      select: { id: true, orderNumber: true, isActive: true },
    });

    for (const legacy of legacyQuestions) {
      if (legacy.isActive || legacy.orderNumber < 100) {
        await this.prisma.question.update({
          where: { id: legacy.id },
          data: {
            isActive: false,
            orderNumber: legacy.orderNumber < 100 ? legacy.orderNumber + 100 : legacy.orderNumber,
          },
        });
      }
    }

    for (const qConfig of ROUND3_QUESTIONS_CONFIG) {
      // Match by exact title first; fallback to active question at the same orderNumber
      let existing = await this.prisma.question.findFirst({
        where: {
          roundId: round3.id,
          title: qConfig.title,
        },
      });

      if (!existing) {
        // Fallback: find any active question at this orderNumber (title may have changed between versions)
        existing = await this.prisma.question.findFirst({
          where: {
            roundId: round3.id,
            orderNumber: qConfig.orderNumber,
            isActive: true,
          },
        });
      }

      const optionsData = qConfig.options.map((opt) => ({
        key: opt.key,
        label: opt.label,
        code: opt.code,
        explanation: opt.explanation,
      }));

      // Options index: A -> 0, B -> 1, C -> 2, D -> 3
      const correctOptionIndex =
        qConfig.correctOptionKey === 'A'
          ? 0
          : qConfig.correctOptionKey === 'B'
          ? 1
          : qConfig.correctOptionKey === 'C'
          ? 2
          : 3;

      const questionData = {
        title: qConfig.title,
        caseNumber: qConfig.caseNumber,
        type: 'CODING_CASE' as const,
        description: qConfig.description,
        starterCode: qConfig.starterCode,
        language: 'python',
        marks: qConfig.marks,
        options: optionsData as any,
        correctOption: correctOptionIndex,
        sampleTestCases: qConfig.sampleTestCases as any,
        hiddenTestCases: qConfig.hiddenTestCases as any,
        rubric: {
          difficulty: qConfig.difficulty,
          technology: qConfig.technology,
          concept: qConfig.concept,
          format: qConfig.format,
          correctOptionKey: qConfig.correctOptionKey,
          caseTitle: qConfig.caseTitle,
        } as any,
        isActive: true,
      };

      if (existing) {
        await this.prisma.question.update({
          where: { id: existing.id },
          data: questionData,
        });
      } else {
        await this.prisma.question.create({
          data: {
            roundId: round3.id,
            orderNumber: qConfig.orderNumber,
            ...questionData,
          },
        });
      }
    }

    this.logger.log('Round 3 Event Analytics questions synchronized successfully.');
  }

  // ============================================================================
  // DATASET EXPLORER & PREVIEWS
  // ============================================================================

  getDatasetMeta(): DatasetMetaDto {
    if (this.cachedDatasetMeta) {
      return this.cachedDatasetMeta;
    }

    const files: DatasetFileMetaDto[] = [];
    const fileKeys = [
      'participants.csv',
      'submission_ids.csv',
      'submission_status_summary.csv',
      'team_leaderboard.csv',
      'team_round_scores.csv',
      'verification_summary.csv',
    ];

    for (const filename of fileKeys) {
      const filePath = path.join(DATASET_DIR, filename);
      if (!fs.existsSync(filePath)) {
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
      const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length === 0) continue;

      const headers = this.parseCsvLine(lines[0]);
      const previewRows: Record<string, any>[] = [];

      for (let i = 1; i < Math.min(lines.length, 11); i++) {
        const vals = this.parseCsvLine(lines[i]);
        const row: Record<string, any> = {};
        headers.forEach((h, idx) => {
          row[h] = vals[idx] !== undefined ? vals[idx] : null;
        });
        previewRows.push(row);
      }

      const info = DATASET_FILES_INFO[filename] || {
        title: filename,
        description: 'Simulated dataset file.',
      };

      files.push({
        filename,
        title: info.title,
        description: info.description,
        recordCount: lines.length - 1,
        columns: headers,
        previewRows,
      });
    }

    const jsonPath = path.join(DATASET_DIR, 'IGNITRON_Round3_Reference_Dataset.json');
    if (fs.existsSync(jsonPath)) {
      const jsonRows = this.buildReferenceJsonRows(jsonPath);
      files.unshift({
        filename: 'IGNITRON_Round3_Reference_Dataset.json',
        title: 'IGNITRON Round 3 Reference Dataset (JSON)',
        description: 'Master JSON dataset containing all 5 sections (100 participants, 1,000 submissions, 50 teams) and verification metrics.',
        recordCount: jsonRows.length,
        columns: ['section', 'record_count', 'description', 'verified_highlight'],
        previewRows: jsonRows.slice(0, 10),
      });
    }

    this.cachedDatasetMeta = {
      datasetName: 'IGNITRON_Round3_Reference_Dataset',
      version: '2.0.0',
      description:
        'Reference dataset for the six Python Code Tracing Challenge questions (100 participants, 50 teams, 1,000 submissions, and verification summary).',
      files,
    };

    return this.cachedDatasetMeta;
  }

  getDatasetFilePath(filename: string): { fullPath: string; mimeType: string } {
    const allowed = [
      'participants.csv',
      'submission_ids.csv',
      'submission_status_summary.csv',
      'team_leaderboard.csv',
      'team_round_scores.csv',
      'verification_summary.csv',
      'IGNITRON_Round3_Reference_Dataset.json',
    ];

    if (!allowed.includes(filename)) {
      throw new NotFoundException(`File "${filename}" does not exist in dataset.`);
    }

    const fullPath = path.join(DATASET_DIR, filename);
    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException(`File "${filename}" not found on disk.`);
    }

    const mimeType = filename.endsWith('.json') ? 'application/json' : 'text/csv';
    return { fullPath, mimeType };
  }

  getDatasetPreview(filename: string, page = 1, limit = 20, search?: string) {
    const { fullPath } = this.getDatasetFilePath(filename);

    if (filename.endsWith('.json')) {
      let allRows = this.buildReferenceJsonRows(fullPath);
      if (search && search.trim().length > 0) {
        const q = search.trim().toLowerCase();
        allRows = allRows.filter((r) =>
          Object.values(r).some((v) => String(v).toLowerCase().includes(q)),
        );
      }
      const totalRows = allRows.length;
      const totalPages = Math.ceil(totalRows / limit) || 1;
      const p = Math.max(1, Math.min(page, totalPages));
      const startIdx = (p - 1) * limit;
      return {
        totalRows,
        page: p,
        limit,
        totalPages,
        columns: ['section', 'record_count', 'description', 'verified_highlight'],
        rows: allRows.slice(startIdx, startIdx + limit),
      };
    }

    const content = fs.readFileSync(fullPath, 'utf-8').replace(/^\uFEFF/, '');
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) {
      return { totalRows: 0, page: 1, limit, totalPages: 0, columns: [], rows: [] };
    }

    const headers = this.parseCsvLine(lines[0]);
    let allRows: Record<string, any>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const vals = this.parseCsvLine(lines[i]);
      const row: Record<string, any> = {};
      headers.forEach((h, idx) => {
        row[h] = vals[idx] !== undefined ? vals[idx] : null;
      });
      allRows.push(row);
    }

    if (search && search.trim().length > 0) {
      const q = search.trim().toLowerCase();
      allRows = allRows.filter((r) =>
        Object.values(r).some((v) => String(v).toLowerCase().includes(q)),
      );
    }

    const totalRows = allRows.length;
    const totalPages = Math.ceil(totalRows / limit) || 1;
    const p = Math.max(1, Math.min(page, totalPages));
    const startIdx = (p - 1) * limit;
    const rows = allRows.slice(startIdx, startIdx + limit);

    return {
      totalRows,
      page: p,
      limit,
      totalPages,
      columns: headers,
      rows,
    };
  }

  private buildReferenceJsonRows(jsonPath: string): Record<string, any>[] {
    const raw = fs.readFileSync(jsonPath, 'utf-8').replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw);
    const sections = parsed?.sections || {};
    const v = parsed?.verification || {};

    return [
      {
        section: 'participant_scores',
        record_count: sections.participant_scores?.record_count ?? 100,
        description: sections.participant_scores?.description || '',
        verified_highlight: `P101 total=${v.p101_total_score}; Highest=${v.highest_participant?.participant_id} (${v.highest_participant?.total_score})`,
      },
      {
        section: 'submission_status_summary',
        record_count: sections.submission_status_summary?.record_count ?? 1000,
        description: sections.submission_status_summary?.description || '',
        verified_highlight: `ACCEPTED=${v.accepted_submission_count} / ${v.submission_count}`,
      },
      {
        section: 'submission_ids',
        record_count: sections.submission_ids?.record_count ?? 1000,
        description: sections.submission_ids?.description || '',
        verified_highlight: `Duplicates=${v.duplicate_submission_id_count}`,
      },
      {
        section: 'team_leaderboard',
        record_count: sections.team_leaderboard?.record_count ?? 50,
        description: sections.team_leaderboard?.description || '',
        verified_highlight: `Rank 1=${v.highest_team?.team_id} (${v.highest_team?.team_name}, ${v.highest_team?.total_score})`,
      },
      {
        section: 'team_round_scores',
        record_count: sections.team_round_scores?.record_count ?? 50,
        description: sections.team_round_scores?.description || '',
        verified_highlight: `Totals match leaderboard=${v.team_totals_match_leaderboard_csv}`,
      },
      {
        section: 'verification',
        record_count: Object.keys(v).length,
        description: 'Official ground-truth verification metrics',
        verified_highlight: `Top 3: ${(v.top_three_teams || []).map((t: any) => t.team_id).join(', ')}`,
      },
    ];
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (insideQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  // ============================================================================
  // ARENA STATE RETRIEVAL
  // ============================================================================

  async getAnalyticsArenaState(teamUser: AuthTeamUser): Promise<AnalyticsArenaStateDto> {
    const { round, progress, state, remainingSeconds } = await this.arenaService.assertRoundAccess(
      teamUser,
      3,
      'READ',
    );

    const questions = await this.prisma.question.findMany({
      where: { roundId: round.id, isActive: true },
      orderBy: { orderNumber: 'asc' },
    });

    // Load team's draft codes
    const drafts = await this.prisma.workspaceDraft.findMany({
      where: { teamId: teamUser.id, roundId: round.id },
    });
    const draftsByOrder = new Map<number, string>();
    drafts.forEach((d) => draftsByOrder.set(d.caseNumber, d.sourceCode));

    // Load team's MCQ answers (for Q1, Q3, Q5)
    const mcqAnswers = await this.prisma.teamMcqAnswer.findMany({
      where: { teamId: teamUser.id, question: { roundId: round.id } },
      include: { question: true },
    });
    const mcqByQuestionId = new Map<string, 'A' | 'B' | 'C' | 'D'>();
    mcqAnswers.forEach((ans) => {
      if (ans.selectedOption !== null && ans.selectedOption !== undefined) {
        const key =
          ans.selectedOption === 0
            ? 'A'
            : ans.selectedOption === 1
            ? 'B'
            : ans.selectedOption === 2
            ? 'C'
            : 'D';
        mcqByQuestionId.set(ans.questionId, key);
      }
    });

    // Load team's submissions
    const submissions = await this.prisma.submission.findMany({
      where: {
        teamId: teamUser.id,
        roundId: round.id,
        isTestRun: false,
      },
      orderBy: { submittedAt: 'desc' },
    });
    const subByQuestionId = new Map<string, any>();
    submissions.forEach((s) => {
      if (s.questionId && !subByQuestionId.has(s.questionId)) {
        subByQuestionId.set(s.questionId, s);
      }
    });

    const questionDtos: AnalyticsQuestionDto[] = questions.map((q) => {
      const qConfig = ROUND3_QUESTIONS_CONFIG.find((c) => c.orderNumber === q.orderNumber);
      const isSelectCode = qConfig?.format === 'SELECT_CODE';

      const selectedOption = mcqByQuestionId.get(q.id) || null;
      const savedCode = draftsByOrder.get(q.orderNumber) || q.starterCode || '';
      const sub = subByQuestionId.get(q.id);

      let status: 'UNATTEMPTED' | 'DRAFT' | 'SAVED' | 'SUBMITTED' = 'UNATTEMPTED';
      if (sub) {
        status = 'SUBMITTED';
      } else if (isSelectCode && selectedOption) {
        status = 'SAVED';
      } else if (draftsByOrder.has(q.orderNumber)) {
        status = 'DRAFT';
      }

      // Format options: omit correct answer and internal explanations for participants!
      const sanitizedOptions = qConfig?.options.map((opt) => ({
        key: opt.key,
        label: opt.label,
        code: opt.code,
      }));

      const sanitizedSamples = (qConfig?.sampleTestCases || []).map((s) => ({
        caseIndex: s.caseIndex,
        name: s.name,
        stdin: s.stdin,
        expectedOutput: s.expectedOutput,
        explanation: s.explanation,
      }));

      return {
        id: q.id,
        orderNumber: q.orderNumber,
        caseNumber: (q.caseNumber || qConfig?.caseNumber || 1) as 1 | 2 | 3,
        caseTitle: qConfig?.caseTitle || `Case ${q.caseNumber}`,
        title: q.title,
        difficulty: qConfig?.difficulty || 'MEDIUM',
        marks: Number(q.marks),
        format: qConfig?.format || 'WRITE_CODE',
        technology: qConfig?.technology || 'Python',
        concept: qConfig?.concept || 'Analytics',
        description: q.description,
        fixtureDescription: qConfig?.fixtureDescription,
        fixtureTable: qConfig?.fixtureTable,
        options: sanitizedOptions,
        starterCode: q.starterCode || qConfig?.starterCode || '',
        sampleTestCases: sanitizedSamples,
        status,
        selectedOption,
        savedCode,
        score: null,
        isSubmitted: !!sub,
      };
    });

    // Group into 3 cases (2 marks each = 6 marks total)
    const cases = [
      {
        caseNumber: 1 as const,
        caseTitle: 'Case 01 – Data Fundamentals',
        caseDescription: 'Trace Python snippets to calculate P101\'s total score and identify the highest-scoring participant.',
        totalMarks: 2,
        questions: questionDtos.filter((q) => q.caseNumber === 1),
      },
      {
        caseNumber: 2 as const,
        caseTitle: 'Case 02 – Data Integrity',
        caseDescription: 'Trace Python snippets to count accepted submissions and detect duplicate submission IDs.',
        totalMarks: 2,
        questions: questionDtos.filter((q) => q.caseNumber === 2),
      },
      {
        caseNumber: 3 as const,
        caseTitle: 'Case 03 – Analytical Intelligence',
        caseDescription: 'Trace Python snippets to find the highest-ranked team and apply multi-key team ranking.',
        totalMarks: 2,
        questions: questionDtos.filter((q) => q.caseNumber === 3),
      },
    ];

    const dataset = this.getDatasetMeta();
    const isSubmitted = progress.participationStatus === 'SUBMITTED';

    return {
      roundNumber: 3,
      roundName: 'Python Code Tracing Challenge',
      roundStatus: round.status,
      remainingSeconds,
      isPaused: state?.isPaused ?? false,
      isSubmitted,
      totalScore: null,
      scoreBreakdown: null,
      cases,
      dataset,
      activeParticipantId: teamUser.activeParticipant?.id,
      activeParticipantName: teamUser.activeParticipant?.fullName,
    };
  }

  // ============================================================================
  // DRAFTING & OPTION SELECTION
  // ============================================================================

  async saveDraft(teamUser: AuthTeamUser, dto: SaveAnalyticsDraftDto) {
    await this.arenaService.verifyActiveParticipantSession(teamUser);
    const { round, progress } = await this.arenaService.assertRoundAccess(teamUser, 3, 'WRITE');

    if (progress.participationStatus === 'SUBMITTED') {
      throw new BadRequestException('Round 3 has already been submitted by your team.');
    }

    const question = await this.prisma.question.findUnique({
      where: { id: dto.questionId },
    });
    if (!question || question.roundId !== round.id) {
      throw new NotFoundException('Question not found in Round 3.');
    }

    const draft = await this.prisma.workspaceDraft.upsert({
      where: {
        teamId_roundId_caseNumber: {
          teamId: teamUser.id,
          roundId: round.id,
          caseNumber: question.orderNumber,
        },
      },
      update: {
        sourceCode: dto.sourceCode,
        language: 'python',
        lastEditedByParticipantId: teamUser.activeParticipant?.id,
        version: { increment: 1 },
      },
      create: {
        teamId: teamUser.id,
        roundId: round.id,
        caseNumber: question.orderNumber,
        sourceCode: dto.sourceCode,
        language: 'python',
        lastEditedByParticipantId: teamUser.activeParticipant?.id,
        version: 1,
      },
    });

    return {
      success: true,
      caseNumber: draft.caseNumber,
      version: draft.version,
      updatedAt: draft.updatedAt.toISOString(),
    };
  }

  async selectOption(teamUser: AuthTeamUser, dto: SelectAnalyticsOptionDto) {
    await this.arenaService.verifyActiveParticipantSession(teamUser);
    const { round, progress } = await this.arenaService.assertRoundAccess(teamUser, 3, 'WRITE');

    if (progress.participationStatus === 'SUBMITTED') {
      throw new BadRequestException('Round 3 has already been submitted by your team.');
    }

    const question = await this.prisma.question.findUnique({
      where: { id: dto.questionId },
    });
    if (!question || question.roundId !== round.id) {
      throw new NotFoundException('Question not found in Round 3.');
    }

    const optionMap: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
    const optionIdx = optionMap[dto.selectedOption];
    if (optionIdx === undefined) {
      throw new BadRequestException('Invalid option selected. Must be A, B, C, or D.');
    }

    const answer = await this.prisma.teamMcqAnswer.upsert({
      where: {
        id: (
          await this.prisma.teamMcqAnswer.findFirst({
            where: { teamId: teamUser.id, questionId: question.id },
            select: { id: true },
          })
        )?.id || 'non_existent_id',
      },
      update: {
        selectedOption: optionIdx,
        updatedAt: new Date(),
      },
      create: {
        teamId: teamUser.id,
        questionId: question.id,
        selectedOption: optionIdx,
      },
    });

    return {
      success: true,
      questionId: question.id,
      selectedOption: dto.selectedOption,
      savedAt: answer.updatedAt.toISOString(),
    };
  }

  // ============================================================================
  // SAMPLE TEST RUN (PREVIEW & DEBUGGING)
  // ============================================================================

  async executeSampleTest(teamUser: AuthTeamUser, questionId: string, sourceCode: string) {
    await this.arenaService.verifyActiveParticipantSession(teamUser);
    await this.arenaService.assertRoundAccess(teamUser, 3, 'READ');

    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
    });
    if (!question) {
      throw new NotFoundException('Question not found.');
    }

    const qConfig = ROUND3_QUESTIONS_CONFIG.find((c) => c.orderNumber === question.orderNumber);
    const sampleTests = qConfig?.sampleTestCases || [];

    if (sampleTests.length === 0) {
      throw new BadRequestException('No sample test cases configured for this question.');
    }

    const codeToRun = this.wrapPythonHarness(sourceCode);
    const results: AnalyticsTestCaseResultDto[] = [];
    let passedCount = 0;

    for (const tc of sampleTests) {
      let execRes: any;
      try {
        execRes = await this.judge0Client.execute(
          codeToRun,
          71, // Python 3
          tc.stdin,
          5, // 5 seconds limit
          128000, // 128 MB limit
        );
      } catch (err: any) {
        execRes = {
          status: { id: 13, description: 'Internal Error' },
          stdout: null,
          stderr: err?.message || 'Judge0 execution error',
          compile_output: null,
          time: null,
          memory: null,
        };
      }

      const norm = this.judge0Client.normalizeStatus(execRes.status);
      let passed = false;
      let statusStr = 'WRONG_ANSWER';

      if (norm.isCompilationError) {
        statusStr = 'COMPILATION_ERROR';
      } else if (norm.isTimeLimitExceeded) {
        statusStr = 'TIME_LIMIT_EXCEEDED';
      } else if (norm.isRuntimeError) {
        statusStr = 'RUNTIME_ERROR';
      } else if (norm.isSuccess) {
        const actual = (execRes.stdout || '').trim();
        const expected = tc.expectedOutput.trim();
        if (this.deepEqualWithTolerance(actual, expected)) {
          passed = true;
          statusStr = 'ACCEPTED';
          passedCount++;
        }
      }

      results.push({
        caseIndex: tc.caseIndex,
        isHidden: false,
        passed,
        status: statusStr,
        executionTime: execRes.time ? String(execRes.time) : null,
        memory: execRes.memory ? Number(execRes.memory) : null,
        stdin: tc.stdin,
        expectedOutput: tc.expectedOutput,
        actualOutput: execRes.stdout || null,
        compileOutput: execRes.compile_output || null,
        stderr: execRes.stderr || null,
      });

      if (norm.isCompilationError) break;
    }

    return {
      passedTests: passedCount,
      totalTests: sampleTests.length,
      allPassed: passedCount === sampleTests.length,
      testCaseResults: results,
    };
  }

  // ============================================================================
  // QUESTION SUBMISSION & GRADING
  // ============================================================================

  async submitQuestion(
    teamUser: AuthTeamUser,
    dto: SubmitAnalyticsQuestionDto,
  ): Promise<AnalyticsSubmissionResultDto> {
    await this.arenaService.verifyActiveParticipantSession(teamUser);
    const { round, progress } = await this.arenaService.assertRoundAccess(teamUser, 3, 'SUBMIT');

    if (progress.participationStatus === 'SUBMITTED') {
      throw new BadRequestException('Round 3 has already been officially submitted by your team.');
    }

    const question = await this.prisma.question.findUnique({
      where: { id: dto.questionId },
    });
    if (!question || question.roundId !== round.id) {
      throw new NotFoundException('Question not found in Round 3.');
    }

    const qConfig = ROUND3_QUESTIONS_CONFIG.find((c) => c.orderNumber === question.orderNumber);
    if (!qConfig) {
      throw new NotFoundException('Configuration for question not found.');
    }

    const maxMarks = qConfig.marks;
    let awardedScore = 0;
    let finalStatus: 'ACCEPTED' | 'WRONG_ANSWER' | 'COMPILATION_ERROR' | 'RUNTIME_ERROR' | 'TIME_LIMIT_EXCEEDED' = 'WRONG_ANSWER';
    let message = '';
    let testResults: AnalyticsTestCaseResultDto[] = [];
    let passedCount = 0;
    let totalCount = 0;
    let stdout: string | null = null;
    let stderr: string | null = null;
    let compileOutput: string | null = null;
    let sourceCodeStored = dto.sourceCode || '';

    if (qConfig.format === 'SELECT_CODE') {
      const selectedKey = dto.selectedOption;
      if (!selectedKey) {
        throw new BadRequestException('Option selection (A, B, C, or D) is required for this question.');
      }

      // Record selection in TeamMcqAnswer
      const optionMap: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
      await this.prisma.teamMcqAnswer.upsert({
        where: {
          id: (
            await this.prisma.teamMcqAnswer.findFirst({
              where: { teamId: teamUser.id, questionId: question.id },
              select: { id: true },
            })
          )?.id || 'non_existent_id',
        },
        update: { selectedOption: optionMap[selectedKey], updatedAt: new Date() },
        create: {
          teamId: teamUser.id,
          questionId: question.id,
          selectedOption: optionMap[selectedKey],
        },
      });

      const isCorrect = selectedKey === qConfig.correctOptionKey;
      awardedScore = isCorrect ? maxMarks : 0;
      finalStatus = isCorrect ? 'ACCEPTED' : 'WRONG_ANSWER';
      message = `Option ${selectedKey} submitted and recorded.`;

      testResults = [
        {
          caseIndex: 1,
          isHidden: true,
          passed: isCorrect,
          status: 'RECORDED',
          expectedOutput: 'Hidden during active competition',
          actualOutput: `Option ${selectedKey}`,
        },
      ];
      passedCount = isCorrect ? 1 : 0;
      totalCount = 1;
      sourceCodeStored = dto.sourceCode || `# Selected Option: ${selectedKey}\n`;
    } else {
      // WRITE_CODE format (Q2, Q4, Q6)
      if (!dto.sourceCode || dto.sourceCode.trim().length === 0) {
        throw new BadRequestException('Source code is required for analytical coding questions.');
      }

      const allTestCases = [...qConfig.sampleTestCases, ...qConfig.hiddenTestCases];
      totalCount = allTestCases.length;

      const codeToRun = this.wrapPythonHarness(dto.sourceCode);
      let hasCompilationError = false;
      let hasRuntimeError = false;
      let hasTimeLimit = false;

      for (const tc of allTestCases) {
        let execRes: any;
        try {
          execRes = await this.judge0Client.execute(
            codeToRun,
            71,
            tc.stdin,
            5,
            128000,
          );
        } catch (err: any) {
          execRes = {
            status: { id: 13, description: 'Internal Error' },
            stdout: null,
            stderr: err?.message || 'Judge0 execution error',
            compile_output: null,
            time: null,
            memory: null,
          };
        }

        const norm = this.judge0Client.normalizeStatus(execRes.status);
        if (execRes.compile_output && !compileOutput) compileOutput = execRes.compile_output;
        if (execRes.stderr && !stderr) stderr = execRes.stderr;
        if (execRes.stdout) stdout = execRes.stdout;

        let passed = false;
        let caseStatus = 'WRONG_ANSWER';

        if (norm.isCompilationError) {
          hasCompilationError = true;
          caseStatus = 'COMPILATION_ERROR';
        } else if (norm.isTimeLimitExceeded) {
          hasTimeLimit = true;
          caseStatus = 'TIME_LIMIT_EXCEEDED';
        } else if (norm.isRuntimeError) {
          hasRuntimeError = true;
          caseStatus = 'RUNTIME_ERROR';
        } else if (norm.isSuccess) {
          const actual = (execRes.stdout || '').trim();
          const expected = tc.expectedOutput.trim();
          if (this.deepEqualWithTolerance(actual, expected)) {
            passed = true;
            caseStatus = 'ACCEPTED';
            passedCount++;
          }
        }

        testResults.push({
          caseIndex: tc.caseIndex,
          isHidden: tc.isHidden,
          passed,
          status: caseStatus,
          executionTime: execRes.time ? String(execRes.time) : null,
          memory: execRes.memory ? Number(execRes.memory) : null,
          stdin: tc.isHidden ? undefined : tc.stdin,
          expectedOutput: tc.isHidden ? undefined : tc.expectedOutput,
          actualOutput: tc.isHidden ? undefined : execRes.stdout || null,
          compileOutput: tc.isHidden ? undefined : execRes.compile_output || null,
          stderr: tc.isHidden ? undefined : execRes.stderr || null,
        });

        if (norm.isCompilationError) break;
      }

      if (hasCompilationError) {
        finalStatus = 'COMPILATION_ERROR';
        awardedScore = 0;
        message = 'Python syntax or module error during execution.';
      } else if (passedCount === totalCount && totalCount > 0) {
        finalStatus = 'ACCEPTED';
        awardedScore = maxMarks;
        message = `All ${totalCount} test suites passed! Full marks awarded.`;
      } else {
        if (hasTimeLimit) {
          finalStatus = 'TIME_LIMIT_EXCEEDED';
        } else if (hasRuntimeError) {
          finalStatus = 'RUNTIME_ERROR';
        } else {
          finalStatus = 'WRONG_ANSWER';
        }
        awardedScore = Math.round((passedCount / totalCount) * maxMarks * 100) / 100;
        message = `Evaluated: ${passedCount}/${totalCount} test cases passed. Awarded ${awardedScore}/${maxMarks} marks.`;
      }
    }

    const now = new Date();

    // Persist or Safely Upsert Submission (Prevent duplicate records per question per team)
    let submission;
    const existingSub = await this.prisma.submission.findFirst({
      where: {
        teamId: teamUser.id,
        roundId: round.id,
        questionId: question.id,
        isTestRun: false,
      },
    });

    if (existingSub) {
      submission = await this.prisma.submission.update({
        where: { id: existingSub.id },
        data: {
          language: 'python',
          sourceCode: sourceCodeStored,
          stdout,
          stderr,
          compileOutput,
          submissionStatus: finalStatus,
          score: awardedScore,
          testCaseResults: testResults as any,
          submittedAt: now,
          evaluatedAt: now,
        },
      });
    } else {
      submission = await this.prisma.submission.create({
        data: {
          teamId: teamUser.id,
          roundId: round.id,
          questionId: question.id,
          language: 'python',
          sourceCode: sourceCodeStored,
          stdout,
          stderr,
          compileOutput,
          submissionStatus: finalStatus,
          score: awardedScore,
          isTestRun: false,
          testCaseResults: testResults as any,
          submittedAt: now,
          evaluatedAt: now,
        },
      });
    }

    // Update TeamRoundProgress
    const currentBreakdown = (progress.scoreBreakdown as any) || {};
    const questionScores: Record<string, number> = {
      ...(currentBreakdown.questionScores || {}),
      [`q${question.orderNumber}`]: awardedScore,
    };

    // Aggregate Case scores
    const case1Score = (questionScores['q1'] || 0) + (questionScores['q2'] || 0);
    const case2Score = (questionScores['q3'] || 0) + (questionScores['q4'] || 0);
    const case3Score = (questionScores['q5'] || 0) + (questionScores['q6'] || 0);
    const codeQualityScore = Number(currentBreakdown.codeQuality || 0);

    const totalRoundScore = Math.min(6, Math.max(0, case1Score + case2Score + case3Score));

    await this.prisma.teamRoundProgress.update({
      where: { id: progress.id },
      data: {
        score: totalRoundScore,
        evaluatedAt: now,
        scoreBreakdown: {
          ...currentBreakdown,
          questionScores,
          case1Score,
          case2Score,
          case3Score,
          codeQuality: codeQualityScore,
          totalScore: totalRoundScore,
        },
      },
    });

    // Activity log
    await this.prisma.activityLog.create({
      data: {
        actorType: 'TEAM',
        actorId: teamUser.id,
        action: 'SUBMIT_ROUND3_QUESTION',
        description: `Team "${teamUser.teamName}" submitted ${qConfig.title} (Case ${qConfig.caseNumber}). Verdict: ${finalStatus}, Score: ${awardedScore}/${maxMarks}.`,
        metadata: {
          questionId: question.id,
          orderNumber: question.orderNumber,
          caseNumber: qConfig.caseNumber,
          verdict: finalStatus,
          score: awardedScore,
          passedCount,
          totalCount,
        },
      },
    });

    return {
      submissionId: submission.id,
      questionId: question.id,
      orderNumber: question.orderNumber,
      caseNumber: qConfig.caseNumber,
      status: 'ACCEPTED',
      isCorrect: false,
      score: null,
      maximumMarks: null,
      passedCount: 0,
      totalCount,
      message,
      stdout,
      stderr,
      compileOutput,
      testCaseResults: [],
    };
  }

  /**
   * Contestant: Submit both MCQ answers for a Round 3 case atomically.
   * Evaluates marks on the server without revealing correct answers during active competition.
   */
  async submitCase(
    teamUser: AuthTeamUser,
    dto: {
      caseNumber: 1 | 2 | 3;
      answers: Array<{ questionId: string; selectedOption: 'A' | 'B' | 'C' | 'D' }>;
    },
  ) {
    await this.arenaService.verifyActiveParticipantSession(teamUser);
    const { round, progress } = await this.arenaService.assertRoundAccess(teamUser, 3, 'SUBMIT');

    if (progress.participationStatus === 'SUBMITTED') {
      throw new BadRequestException('Round 3 has already been officially submitted by your team.');
    }

    const caseNum = Number(dto.caseNumber) as 1 | 2 | 3;
    if (![1, 2, 3].includes(caseNum)) {
      throw new BadRequestException('Invalid case number. Must be 1, 2, or 3.');
    }

    const caseQuestions = await this.prisma.question.findMany({
      where: { roundId: round.id, caseNumber: caseNum, isActive: true },
      orderBy: { orderNumber: 'asc' },
    });

    if (caseQuestions.length === 0) {
      throw new NotFoundException(`No questions found for Case ${caseNum}.`);
    }

    if (!Array.isArray(dto.answers) || dto.answers.length !== caseQuestions.length) {
      throw new BadRequestException(
        `All ${caseQuestions.length} questions in Case ${caseNum} must be answered before submitting.`,
      );
    }

    const answerByQuestionId = new Map<string, 'A' | 'B' | 'C' | 'D'>();
    const validKeys = new Set(['A', 'B', 'C', 'D']);
    for (const ans of dto.answers) {
      const opt = (ans?.selectedOption || '').toUpperCase() as 'A' | 'B' | 'C' | 'D';
      if (!ans?.questionId || !validKeys.has(opt)) {
        throw new BadRequestException('Each question answer must be A, B, C, or D.');
      }
      answerByQuestionId.set(ans.questionId, opt);
    }

    for (const q of caseQuestions) {
      if (!answerByQuestionId.has(q.id)) {
        throw new BadRequestException(`Missing answer for question ${q.title}.`);
      }
    }

    // Prevent duplicate case submission
    const existingSubmissions = await this.prisma.submission.findMany({
      where: {
        teamId: teamUser.id,
        roundId: round.id,
        questionId: { in: caseQuestions.map((q) => q.id) },
        isTestRun: false,
      },
      select: { id: true, questionId: true },
    });

    if (existingSubmissions.length >= caseQuestions.length) {
      throw new BadRequestException(`Case ${caseNum} has already been submitted by your team.`);
    }

    const optionMap: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
    const now = new Date();
    const currentBreakdown = (progress.scoreBreakdown as any) || {};
    const questionScores: Record<string, number> = {
      ...(currentBreakdown.questionScores || {}),
    };
    const submittedQuestionIds: string[] = [];

    for (const q of caseQuestions) {
      const qConfig = ROUND3_QUESTIONS_CONFIG.find((c) => c.orderNumber === q.orderNumber);
      const selectedKey = answerByQuestionId.get(q.id)!;
      const maxMarks = qConfig ? qConfig.marks : Number(q.marks);
      const correctKey = qConfig ? qConfig.correctOptionKey : (['A', 'B', 'C', 'D'][q.correctOption ?? 0] as 'A' | 'B' | 'C' | 'D');
      const isCorrect = selectedKey === correctKey;
      const awardedScore = isCorrect ? maxMarks : 0;
      const finalStatus = isCorrect ? 'ACCEPTED' : 'WRONG_ANSWER';

      const existingMcq = await this.prisma.teamMcqAnswer.findFirst({
        where: { teamId: teamUser.id, questionId: q.id },
        select: { id: true },
      });

      if (existingMcq) {
        await this.prisma.teamMcqAnswer.update({
          where: { id: existingMcq.id },
          data: { selectedOption: optionMap[selectedKey], updatedAt: now },
        });
      } else {
        await this.prisma.teamMcqAnswer.create({
          data: {
            teamId: teamUser.id,
            questionId: q.id,
            selectedOption: optionMap[selectedKey],
          },
        });
      }

      const existingSub = existingSubmissions.find((s) => s.questionId === q.id);
      if (!existingSub) {
        await this.prisma.submission.create({
          data: {
            teamId: teamUser.id,
            roundId: round.id,
            questionId: q.id,
            language: 'python',
            sourceCode: `# Selected Option: ${selectedKey}\n`,
            stdout: `Option ${selectedKey}`,
            stderr: null,
            compileOutput: null,
            submissionStatus: finalStatus,
            score: awardedScore,
            isTestRun: false,
            testCaseResults: [
              {
                caseIndex: 1,
                isHidden: true,
                passed: isCorrect,
                status: finalStatus,
                actualOutput: `Option ${selectedKey}`,
              },
            ] as any,
            submittedAt: now,
            evaluatedAt: now,
          },
        });
      }

      questionScores[`q${q.orderNumber}`] = awardedScore;
      submittedQuestionIds.push(q.id);
    }

    const case1Score = (questionScores['q1'] || 0) + (questionScores['q2'] || 0);
    const case2Score = (questionScores['q3'] || 0) + (questionScores['q4'] || 0);
    const case3Score = (questionScores['q5'] || 0) + (questionScores['q6'] || 0);
    const codeQualityScore = Number(currentBreakdown.codeQuality || 0);
    const totalRoundScore = Math.min(6, Math.max(0, case1Score + case2Score + case3Score));

    await this.prisma.teamRoundProgress.update({
      where: { id: progress.id },
      data: {
        score: totalRoundScore,
        evaluatedAt: now,
        scoreBreakdown: {
          ...currentBreakdown,
          questionScores,
          case1Score,
          case2Score,
          case3Score,
          codeQuality: codeQualityScore,
          totalScore: totalRoundScore,
        },
      },
    });

    await this.prisma.activityLog.create({
      data: {
        actorType: 'TEAM',
        actorId: teamUser.id,
        action: 'SUBMIT_ROUND3_CASE',
        description: `Team "${teamUser.teamName}" submitted Case ${caseNum} (${submittedQuestionIds.length} questions).`,
        metadata: {
          caseNumber: caseNum,
          submittedQuestionIds,
        },
      },
    });

    return {
      success: true,
      caseNumber: caseNum,
      submittedQuestionIds,
      message: `Case 0${caseNum} answers submitted and recorded.`,
      submittedAt: now.toISOString(),
    };
  }

  // ============================================================================
  // FINALIZE ROUND 3
  // ============================================================================

  async finalizeRound3(teamUser: AuthTeamUser) {
    await this.arenaService.verifyActiveParticipantSession(teamUser);
    const { round, progress } = await this.arenaService.assertRoundAccess(teamUser, 3, 'SUBMIT');

    if (progress.participationStatus === 'SUBMITTED') {
      return {
        success: true,
        message: 'Round 3 has already been officially submitted.',
        totalScore: null,
        submittedAt: progress.submittedAt?.toISOString(),
      };
    }

    const now = new Date();
    await this.prisma.teamRoundProgress.update({
      where: { id: progress.id },
      data: {
        participationStatus: 'SUBMITTED',
        submittedAt: now,
      },
    });

    await this.prisma.activityLog.create({
      data: {
        actorType: 'TEAM',
        actorId: teamUser.id,
        action: 'FINALIZE_ROUND3',
        description: `Team "${teamUser.teamName}" officially finalized Round 3 Python Code Tracing Challenge. Total Score: ${progress.score}/6.`,
        metadata: {
          teamId: teamUser.id,
          totalScore: progress.score,
          scoreBreakdown: progress.scoreBreakdown,
        },
      },
    });

    return {
      success: true,
      message: 'Round 3 Event Analytics Engine submitted successfully!',
      totalScore: null,
      submittedAt: now.toISOString(),
    };
  }

  // ============================================================================
  // HARNESS & COMPARISON UTILITIES
  // ============================================================================

  private wrapPythonHarness(code: string): string {
    if (code.includes("if __name__ == '__main__':")) {
      return code;
    }
    return `${code}

if __name__ == '__main__':
    import sys, json
    try:
        _raw = sys.stdin.read().strip()
        _data = json.loads(_raw) if _raw else {}
    except Exception as _e:
        _data = {}
    try:
        _res = solve(_data)
        print(json.dumps(_res, default=str))
    except Exception as _e:
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
`;
  }

  private deepEqualWithTolerance(actualStr: string, expectedStr: string, tolerance = 1e-3): boolean {
    try {
      const act = JSON.parse(actualStr);
      const exp = JSON.parse(expectedStr);
      return this.compareObjects(act, exp, tolerance);
    } catch {
      return actualStr.trim() === expectedStr.trim();
    }
  }

  private compareObjects(a: any, b: any, tol: number): boolean {
    if (typeof a === 'number' && typeof b === 'number') {
      return Math.abs(a - b) <= tol;
    }
    if (typeof a !== typeof b) return false;
    if (a === null || b === null) return a === b;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!this.compareObjects(a[i], b[i], tol)) return false;
      }
      return true;
    }
    if (typeof a === 'object') {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      for (const k of keysA) {
        if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
        if (!this.compareObjects(a[k], b[k], tol)) return false;
      }
      return true;
    }
    return String(a).trim() === String(b).trim();
  }
}
