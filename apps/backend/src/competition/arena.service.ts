import {
  Injectable,
  Inject,
  forwardRef,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CompetitionService } from './competition.service';
import { Judge0ClientService } from '../code-execution/judge0-client.service';
import { ProctoringService } from '../proctoring/proctoring.service';
import {
  AuthTeamUser,
  McqArenaStateDto,
  SaveMcqAnswerDto,
  McqSubmissionResultDto,
  SanitizedQuestionDto,
  QuestionType,
  OFFICIAL_JUDGE0_LANGUAGES,
  EXECUTION_LIMITS,
  BugHuntArenaStateDto,
  ReportBugDto,
  ReportBugResultDto,
  RunBugHuntTestDto,
  BugHuntTestRunResultDto,
} from '@ignitron/shared';
import {
  OFFICIAL_ROUND2_JS_STARTER,
  OFFICIAL_ROUND2_PLANTED_BUGS,
} from './questions.service';
import {
  ROUND2_SUPPORTED_LANGUAGES,
  OFFICIAL_ROUND2_LANGUAGE_STARTERS,
  OFFICIAL_ROUND2_LANGUAGE_BUGS,
  OFFICIAL_ROUND2_VERIFICATION_TESTS,
} from './data/round2-multilang.config';

@Injectable()
export class ArenaService {
  private readonly logger = new Logger(ArenaService.name);
  private readonly recentFocusEvents = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly judge0Client: Judge0ClientService,
    @Inject(forwardRef(() => CompetitionService))
    private readonly competitionService: CompetitionService,
    private readonly proctoringService: ProctoringService,
  ) {}

  /**
   * Strictly verify that the calling participant has the active team terminal session
   */
  async verifyActiveParticipantSession(teamUser: AuthTeamUser): Promise<void> {
    if (!teamUser?.activeParticipant?.id) {
      throw new ForbiddenException(
        'Participant context required. Please authenticate with your participant identity.',
      );
    }

    const activeSession = await this.prisma.teamSession.findFirst({
      where: {
        teamId: teamUser.id,
        participantId: teamUser.activeParticipant.id,
        status: 'ACTIVE',
      },
      orderBy: { lastActivityAt: 'desc' },
    });

    if (!activeSession) {
      throw new ForbiddenException(
        'Participant does not hold the active team terminal session. Please authenticate or request relay handover.',
      );
    }
  }

  /**
   * Normalize output by trimming lines and whitespace
   */
  private normalizeOutput(out: string | null | undefined): string {
    if (!out) return '';
    return out
      .trim()
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n');
  }

  /**
   * Helper to fetch round by roundNumber
   */
  private async getRound(roundNumber: number) {
    const round = await this.prisma.competitionRound.findFirst({
      where: { roundNumber },
    });
    if (!round) {
      throw new NotFoundException(`Round ${roundNumber} does not exist.`);
    }
    return round;
  }

  /**
   * Helper to fetch or create TeamRoundProgress with strict eligibility checks
   */
  private async getOrCreateTeamProgress(teamId: string, roundId: string, roundNumber: number) {
    let progress = await this.prisma.teamRoundProgress.findUnique({
      where: { teamId_roundId: { teamId, roundId } },
    });

    if (!progress) {
      if (roundNumber === 1) {
        // Round 1: All registered active teams are eligible by default
        progress = await this.prisma.teamRoundProgress.create({
          data: {
            teamId,
            roundId,
            eligibilityStatus: 'ELIGIBLE',
            participationStatus: 'NOT_STARTED',
            score: 0,
          },
        });
      } else {
        // Rounds 2 and 3: Must be shortlisted by an administrator
        throw new ForbiddenException(
          `Your team is not qualified for Round ${roundNumber}. Only shortlisted teams may participate.`,
        );
      }
    }

    if (progress.eligibilityStatus !== 'ELIGIBLE') {
      throw new ForbiddenException(
        `Your team is not qualified for Round ${roundNumber}. Only shortlisted teams may participate.`,
      );
    }

    return progress;
  }

  /**
   * Helper to verify if competition round is currently accessible to contestant
   */
  async assertRoundAccess(
    teamUser: AuthTeamUser,
    roundNumber: number,
    action: 'READ' | 'WRITE' | 'SUBMIT',
  ) {
    // 1. Authoritative auto-conclusion check: if deadline passed, transition state immediately
    await this.competitionService.autoConcludeActiveRoundIfExpired();

    // 1a. Authoritative Anti-Cheat & Proctoring Lock Enforcement
    await this.proctoringService.assertParticipantNotLocked(teamUser, roundNumber);

    const round = await this.getRound(roundNumber);
    const progress = await this.getOrCreateTeamProgress(teamUser.id, round.id, roundNumber);

    const state = await this.prisma.competitionState.findUnique({
      where: { id: 'global' },
    });

    const now = new Date();
    const isCountdownActive = Boolean(
      state?.countdownEndsAt && state.countdownEndsAt.getTime() > now.getTime(),
    );

    const isRoundConcluded =
      round.status === 'COMPLETED' ||
      Boolean(
        state &&
          ['ROUND_1_EVALUATION', 'ROUND_2_EVALUATION', 'FINAL_EVALUATION', 'COMPLETED'].includes(state.status as any) &&
          (state.currentRoundNumber || 0) >= roundNumber,
      );

    const isRoundCurrent = state?.currentRoundNumber === roundNumber;
    const isRoundActive =
      !isCountdownActive &&
      !isRoundConcluded &&
      (round.status === 'ACTIVE' ||
        (isRoundCurrent && state?.status === (`ROUND_${roundNumber}_ACTIVE` as any)));

    // Strict workspace and arena visibility lock before round start and after conclusion
    if (action === 'READ') {
      const canReviewSubmitted = progress.participationStatus === 'SUBMITTED' || isRoundConcluded;

      if (!isRoundActive && !canReviewSubmitted) {
        if (isCountdownActive) {
          throw new ForbiddenException(
            `Round ${roundNumber} countdown is in progress. The competition arena will unlock automatically when the countdown completes.`,
          );
        }
        throw new ForbiddenException(
          `The competition arena will become available when Round ${roundNumber} begins.`,
        );
      }
    }

    // If writing or submitting, enforce strict timing & state boundaries
    if (action === 'WRITE' || action === 'SUBMIT') {
      if (isRoundConcluded) {
        throw new ForbiddenException(
          `Round ${roundNumber} has concluded. All workspace editing and submissions are locked.`,
        );
      }

      if (state?.isPaused) {
        throw new ForbiddenException('Competition is currently paused by the administrator.');
      }

      if (isCountdownActive) {
        throw new ForbiddenException(
          `Round ${roundNumber} countdown is in progress. Submissions and changes are locked until the round begins.`,
        );
      }

      if (!isRoundActive) {
        throw new ForbiddenException(`Round ${roundNumber} is not currently active.`);
      }

      const isDeadlineExpired =
        (isRoundCurrent && state?.deadlineAt && state.deadlineAt.getTime() <= now.getTime()) ||
        (isRoundCurrent &&
          state?.remainingDurationSeconds !== null &&
          state?.remainingDurationSeconds !== undefined &&
          state.remainingDurationSeconds <= 0);

      if (isDeadlineExpired) {
        throw new ForbiddenException(`Round ${roundNumber} deadline has expired. Workspace is locked.`);
      }

      if (progress.participationStatus === 'SUBMITTED') {
        throw new ForbiddenException(`Round ${roundNumber} has already been submitted by your team.`);
      }
    }

    let remainingSeconds = round.durationMinutes * 60;
    if (isRoundConcluded) {
      remainingSeconds = 0;
    } else if (isRoundCurrent && state?.deadlineAt && !state.isPaused) {
      remainingSeconds = Math.max(0, Math.floor((state.deadlineAt.getTime() - now.getTime()) / 1000));
    } else if (isRoundCurrent && state?.remainingDurationSeconds !== null && state?.remainingDurationSeconds !== undefined) {
      remainingSeconds = state.remainingDurationSeconds;
    }

    return {
      round,
      progress,
      state,
      isRoundActive,
      isConcluded: isRoundConcluded,
      isPaused: Boolean(state?.isPaused),
      remainingSeconds,
      durationMinutes: round.durationMinutes,
      deadlineAt: state?.deadlineAt ? state.deadlineAt.toISOString() : null,
    };
  }

  // ============================================================================
  // ROUND 1: MCQ ARENA
  // ============================================================================

  /**
   * Get contestant MCQ arena state:
   * Returns timer, questions (without answers), and team's saved answers.
   */
  async getMcqArenaState(teamUser: AuthTeamUser): Promise<McqArenaStateDto> {
    try {
      return await this.getMcqArenaStateInternal(teamUser);
    } catch (err: any) {
      if (
        err?.message?.includes('does not exist in the current database') ||
        err?.message?.includes('Unknown column')
      ) {
        this.logger.warn('Schema mismatch in getMcqArenaState. Executing self-healing...');
        await this.prisma.ensureSchemaCompatibility();
        return await this.getMcqArenaStateInternal(teamUser);
      }
      throw err;
    }
  }

  private async getMcqArenaStateInternal(teamUser: AuthTeamUser): Promise<McqArenaStateDto> {
    const { round, progress, state } = await this.assertRoundAccess(teamUser, 1, 'READ');

    // Fetch questions for Round 1
    const rawQuestions = await this.prisma.question.findMany({
      where: { roundId: round.id, isActive: true },
      orderBy: { orderNumber: 'asc' },
    });

    const questions: SanitizedQuestionDto[] = rawQuestions.map((q) => ({
      id: q.id,
      roundNumber: 1,
      type: q.type as QuestionType,
      orderNumber: q.orderNumber,
      caseNumber: q.caseNumber,
      title: q.title,
      description: q.description,
      starterCode: q.starterCode,
      language: q.language,
      marks: Number(q.marks),
      options: (q.options as string[]) || null,
      sampleTestCases: (q.sampleTestCases as any) || null,
      rubric: (q.rubric as any) || null,
    }));

    // Fetch team's saved answers scoped strictly to active Round 1 questions
    let savedAnswers: Array<{ questionId: string; selectedOption: number | null; isFlagged: boolean }> = [];
    try {
      savedAnswers = await this.prisma.teamMcqAnswer.findMany({
        where: {
          teamId: teamUser.id,
          question: { roundId: round.id, isActive: true },
        },
        select: {
          questionId: true,
          selectedOption: true,
          isFlagged: true,
        },
      });
    } catch {
      savedAnswers = [];
    }

    const answersMap: Record<string, { selectedOption: number | null; isFlagged: boolean }> = {};
    for (const ans of savedAnswers) {
      answersMap[ans.questionId] = {
        selectedOption: ans.selectedOption,
        isFlagged: ans.isFlagged,
      };
    }

    let remainingSeconds = round.durationMinutes * 60;
    if (state?.currentRoundNumber === 1 && state.deadlineAt && !state.isPaused) {
      const now = new Date();
      remainingSeconds = Math.max(0, Math.floor((state.deadlineAt.getTime() - now.getTime()) / 1000));
    } else if (state?.currentRoundNumber === 1 && state.remainingDurationSeconds !== null && state?.remainingDurationSeconds !== undefined) {
      remainingSeconds = state.remainingDurationSeconds;
    }

    return {
      roundNumber: 1,
      durationMinutes: round.durationMinutes,
      remainingSeconds,
      deadlineAt: state?.deadlineAt ? state.deadlineAt.toISOString() : null,
      isPaused: Boolean(state?.isPaused),
      isSubmitted: progress.participationStatus === 'SUBMITTED',
      questions,
      answers: answersMap,
    };
  }

  /**
   * Real-time answer autosave for Round 1 MCQ
   */
  async saveMcqAnswer(teamUser: AuthTeamUser, dto: SaveMcqAnswerDto) {
    const { round, progress } = await this.assertRoundAccess(teamUser, 1, 'WRITE');

    if (progress.participationStatus === 'SUBMITTED') {
      throw new BadRequestException('Round 1 has already been submitted by your team.');
    }

    // Verify question belongs to Round 1
    const question = await this.prisma.question.findFirst({
      where: { id: dto.questionId, roundId: round.id },
    });
    if (!question) {
      throw new NotFoundException('Question does not exist in Round 1.');
    }

    // Upsert answer
    const answer = await this.prisma.teamMcqAnswer.upsert({
      where: {
        teamId_questionId: {
          teamId: teamUser.id,
          questionId: dto.questionId,
        },
      },
      update: {
        selectedOption: dto.selectedOption,
        isFlagged: dto.isFlagged !== undefined ? dto.isFlagged : undefined,
        updatedAt: new Date(),
      },
      create: {
        teamId: teamUser.id,
        questionId: dto.questionId,
        selectedOption: dto.selectedOption,
        isFlagged: Boolean(dto.isFlagged),
      },
    });

    // Mark progress as IN_PROGRESS if first interaction
    if (progress.participationStatus === 'NOT_STARTED') {
      await this.prisma.teamRoundProgress.update({
        where: { id: progress.id },
        data: {
          participationStatus: 'IN_PROGRESS',
          startedAt: progress.startedAt || new Date(),
        },
      });
    }

    return {
      success: true,
      data: {
        questionId: answer.questionId,
        selectedOption: answer.selectedOption,
        isFlagged: answer.isFlagged,
        savedAt: answer.updatedAt.toISOString(),
      },
    };
  }

  /**
   * Final submission and automatic scoring for Round 1 MCQ
   */
  async submitMcqRound(teamUser: AuthTeamUser, autoSubmit = false): Promise<McqSubmissionResultDto> {
    // Check READ access first to allow already-submitted teams to retrieve their authoritative result
    const { round, progress } = await this.assertRoundAccess(teamUser, 1, 'READ');

    if (progress.participationStatus === 'SUBMITTED') {
      const breakdown = (progress.scoreBreakdown as any) || {};
      return {
        totalQuestions: breakdown.totalQuestions || 15,
        answeredCount: breakdown.answeredCount || 0,
        correctCount: breakdown.correctCount || 0,
        score: Number(progress.score ?? 0),
        maximumMarks: 30,
        submittedAt: progress.submittedAt ? progress.submittedAt.toISOString() : new Date().toISOString(),
      };
    }

    // Assert SUBMIT access for active round check, timer, and pause check
    await this.assertRoundAccess(teamUser, 1, 'SUBMIT');

    // Fetch all questions for Round 1 with correct answers
    const questions = await this.prisma.question.findMany({
      where: { roundId: round.id, isActive: true },
      orderBy: { orderNumber: 'asc' },
    });

    // Fetch team's saved answers (use explicit field selection)
    let answers: Array<{ questionId: string; selectedOption: number | null }> = [];
    try {
      answers = await this.prisma.teamMcqAnswer.findMany({
        where: { teamId: teamUser.id },
        select: {
          questionId: true,
          selectedOption: true,
        },
      });
    } catch {
      answers = [];
    }

    const answersMap = new Map<string, number | null>();
    for (const a of answers) {
      answersMap.set(a.questionId, a.selectedOption);
    }

    let correctCount = 0;
    let answeredCount = 0;

    for (const q of questions) {
      const selected = answersMap.get(q.id);
      if (selected !== undefined && selected !== null) {
        answeredCount++;
        if (q.correctOption !== null && selected === q.correctOption) {
          correctCount++;
        }
      }
    }

    const calculatedScore = correctCount * 2.0; // 2 marks each
    const now = new Date();

    const scoreBreakdown = {
      totalQuestions: questions.length,
      answeredCount,
      correctCount,
      autoSubmit,
    };

    // Update TeamRoundProgress
    await this.prisma.teamRoundProgress.update({
      where: { id: progress.id },
      data: {
        score: calculatedScore,
        scoreBreakdown,
        participationStatus: 'SUBMITTED',
        submittedAt: now,
        evaluatedAt: now,
      },
    });

    // Ensure authoritative Submission record exists in submissions table
    const existingSub = await this.prisma.submission.findFirst({
      where: { teamId: teamUser.id, roundId: round.id, isTestRun: false },
    });

    if (existingSub) {
      await this.prisma.submission.update({
        where: { id: existingSub.id },
        data: {
          sourceCode: JSON.stringify(answers),
          language: 'json',
          score: calculatedScore,
          submissionStatus: 'EVALUATED',
          testCaseResults: {
            totalQuestions: questions.length,
            answeredCount,
            correctCount,
            autoSubmit,
          },
          submittedAt: now,
          evaluatedAt: now,
        },
      });
    } else {
      await this.prisma.submission.create({
        data: {
          teamId: teamUser.id,
          roundId: round.id,
          sourceCode: JSON.stringify(answers),
          language: 'json',
          score: calculatedScore,
          submissionStatus: 'EVALUATED',
          isTestRun: false,
          testCaseResults: {
            totalQuestions: questions.length,
            answeredCount,
            correctCount,
            autoSubmit,
          },
          submittedAt: now,
          evaluatedAt: now,
        },
      });
    }

    // Log activity
    await this.prisma.activityLog.create({
      data: {
        actorType: 'TEAM',
        actorId: teamUser.id,
        action: 'SUBMIT_MCQ_ARENA',
        description: `Team "${teamUser.teamName}" (${teamUser.teamCode}) submitted Round 1 MCQs. Score: ${calculatedScore}/30 (${correctCount}/${questions.length} correct).`,
        metadata: {
          teamId: teamUser.id,
          roundNumber: 1,
          score: calculatedScore,
          correctCount,
          answeredCount,
          totalQuestions: questions.length,
          autoSubmit,
        },
      },
    });

    return {
      totalQuestions: questions.length,
      answeredCount,
      correctCount,
      score: calculatedScore,
      maximumMarks: 30,
      submittedAt: now.toISOString(),
    };
  }

  // ============================================================================
  // ROUND 2: BUG HUNT ARENA (INVESTIGATION & CODE REPAIR WORKFLOW)
  // ============================================================================

  /**
   * Contestant: Get current Bug Hunt arena state (Mission briefing, faulty code, isolated defects)
   */
  async getBugHuntArenaState(teamUser: AuthTeamUser): Promise<BugHuntArenaStateDto> {
    const { round, progress, state, isRoundActive, isPaused, remainingSeconds } =
      await this.assertRoundAccess(teamUser, 2, 'READ');

    // 1. Resolve which Round 2 question this team is currently solving:
    // If team has already reported bugs or saved a draft, preserve that exact question
    const existingReport = await this.prisma.teamBugReport.findFirst({
      where: { teamId: teamUser.id },
      select: { questionId: true },
      orderBy: { createdAt: 'desc' },
    });

    let question = null;
    if (existingReport?.questionId) {
      question = await this.prisma.question.findUnique({
        where: { id: existingReport.questionId },
      });
    }

    if (!question) {
      // Find the currently published active Round 2 question
      question = await this.prisma.question.findFirst({
        where: { roundId: round.id, isActive: true },
        orderBy: { orderNumber: 'asc' },
      });
    }

    if (!question) {
      throw new NotFoundException('No active Round 2 Bug Hunt mission is currently published.');
    }

    const plantedBugs = (question.plantedBugs as any[]) ||
      (question.title === 'Bug Hunt: Distributed Token Bucket Rate Limiter' ? OFFICIAL_ROUND2_PLANTED_BUGS : []);

    const rubric = (question.rubric as any) || {};
    const isOfficialTokenBucket = question.title?.includes('Token Bucket');
    const configuredQuestionLang = (question.language || '').toLowerCase();
    const defaultRound2Lang = ROUND2_SUPPORTED_LANGUAGES.includes(configuredQuestionLang as any)
      ? configuredQuestionLang
      : 'c';
    const supportedLanguages = isOfficialTokenBucket
      ? ROUND2_SUPPORTED_LANGUAGES
      : Array.isArray(rubric.supportedLanguages) && rubric.supportedLanguages.length > 0
      ? rubric.supportedLanguages.filter((l: string) => ROUND2_SUPPORTED_LANGUAGES.includes(l.toLowerCase() as any))
      : [defaultRound2Lang];

    const languageStarterCodes: Record<string, string> = {
      ...(isOfficialTokenBucket
        ? {
            c: OFFICIAL_ROUND2_LANGUAGE_STARTERS.c,
            cpp: OFFICIAL_ROUND2_LANGUAGE_STARTERS.cpp,
            java: OFFICIAL_ROUND2_LANGUAGE_STARTERS.java,
            python: OFFICIAL_ROUND2_LANGUAGE_STARTERS.python,
          }
        : {}),
      ...(rubric.languageStarterCodes || {}),
    };
    if (!languageStarterCodes[defaultRound2Lang]) {
      languageStarterCodes[defaultRound2Lang] = question.starterCode || '';
    }

    const draftRecord = await this.prisma.workspaceDraft.findUnique({
      where: {
        teamId_roundId_caseNumber: {
          teamId: teamUser.id,
          roundId: round.id,
          caseNumber: 1,
        },
      },
    });
    const languageDrafts: Record<string, string> = {
      ...((draftRecord?.languageDrafts as Record<string, string>) || {}),
    };
    if (draftRecord?.language && draftRecord?.sourceCode && !languageDrafts[draftRecord.language]) {
      languageDrafts[draftRecord.language] = draftRecord.sourceCode;
    }

    const hasPerBugVerification =
      isOfficialTokenBucket ||
      plantedBugs.some((b: any) => Array.isArray(b.repairValidationTestIndices) && b.repairValidationTestIndices.length > 0);

    // Fetch team's already identified bugs for this question
    const teamReports = await this.prisma.teamBugReport.findMany({
      where: { teamId: teamUser.id, questionId: question.id },
      orderBy: { createdAt: 'asc' },
    });

    const isInvestigationComplete = plantedBugs.length > 0 ? teamReports.length >= plantedBugs.length : true;
    const isSubmitted = progress.participationStatus === 'SUBMITTED';

    return {
      roundNumber: 2,
      questionId: question.id,
      title: question.title,
      description: question.description,
      faultyCode: languageStarterCodes[defaultRound2Lang] || question.starterCode || '',
      language: defaultRound2Lang,
      supportedLanguages,
      languageStarterCodes,
      languageDrafts,
      totalRequired: plantedBugs.length,
      identifiedCount: teamReports.length,
      isInvestigationComplete,
      isRepairUnlocked: isInvestigationComplete,
      isSubmitted,
      score: null,
      scoreBreakdown: null,
      // Strictly sanitize: Only return info for bugs the team has ALREADY isolated! Never expose un-identified bugs or planted answer locations.
      identifiedBugs: teamReports.map((r) => {
        const defaultLangBugs =
          (rubric.languagePlantedBugs && rubric.languagePlantedBugs[defaultRound2Lang]) ||
          (isOfficialTokenBucket && OFFICIAL_ROUND2_LANGUAGE_BUGS[defaultRound2Lang as keyof typeof OFFICIAL_ROUND2_LANGUAGE_BUGS]) ||
          plantedBugs;
        const bugDef = defaultLangBugs.find((b: any) => b.key === r.bugKey) || plantedBugs.find((b: any) => b.key === r.bugKey);
        const languageLocations: Record<string, { lineNumber: number; expression: string }> = {};
        for (const lang of supportedLanguages) {
          const langBugs =
            (rubric.languagePlantedBugs && rubric.languagePlantedBugs[lang]) ||
            (isOfficialTokenBucket && OFFICIAL_ROUND2_LANGUAGE_BUGS[lang as keyof typeof OFFICIAL_ROUND2_LANGUAGE_BUGS]);
          const matched = Array.isArray(langBugs) ? langBugs.find((b: any) => b.key === r.bugKey) : null;
          if (matched) {
            languageLocations[lang] = { lineNumber: matched.lineNumber, expression: matched.expression };
          }
        }
        return {
          bugKey: r.bugKey,
          selectedText: r.selectedText,
          lineNumber: r.lineNumber,
          startOffset: bugDef?.startOffset ?? null,
          endOffset: bugDef?.endOffset ?? null,
          language: defaultRound2Lang,
          languageLocations,
          identifiedAt: r.createdAt.toISOString(),
          bugName: bugDef?.name || r.bugKey,
          description: bugDef?.description,
        };
      }),
      sampleTestCases: (question.sampleTestCases as any[]) || [],
      hasPerBugVerification,
      remainingSeconds,
      isPaused,
      deadlineAt: state?.deadlineAt ? state.deadlineAt.toISOString() : null,
    };
  }

  /**
   * Contestant: Validate and record an identified defect token/expression selection
   */
  async reportBug(teamUser: AuthTeamUser, dto: ReportBugDto): Promise<ReportBugResultDto> {
    await this.verifyActiveParticipantSession(teamUser);

    const { round, progress } = await this.assertRoundAccess(teamUser, 2, 'WRITE');

    if (progress.participationStatus === 'SUBMITTED') {
      throw new BadRequestException('Round 2 has already been submitted by your team.');
    }

    const question = await this.prisma.question.findFirst({
      where: { id: dto.questionId, roundId: round.id },
    });

    if (!question) {
      throw new NotFoundException('Round 2 Bug Hunt question not found.');
    }

    const rubric = (question.rubric as any) || {};
    const isOfficialTokenBucket = question.title?.includes('Token Bucket');
    const defaultLang = ROUND2_SUPPORTED_LANGUAGES.includes((question.language || '').toLowerCase() as any)
      ? (question.language || '').toLowerCase()
      : 'c';
    const reqLang = (dto.language || defaultLang).toLowerCase() as keyof typeof OFFICIAL_ROUND2_LANGUAGE_BUGS;
    if (!ROUND2_SUPPORTED_LANGUAGES.includes(reqLang as any)) {
      throw new BadRequestException(
        `Language "${dto.language}" is not supported for Round 2 Bug Hunt. Allowed languages: C (c), C++ (cpp), Java (java), Python (python).`,
      );
    }
    const langPlantedBugs =
      (rubric.languagePlantedBugs && rubric.languagePlantedBugs[reqLang]) ||
      (isOfficialTokenBucket && OFFICIAL_ROUND2_LANGUAGE_BUGS[reqLang]) ||
      null;

    const plantedBugs = langPlantedBugs ||
      (question.plantedBugs as any[]) ||
      (question.title === 'Bug Hunt: Distributed Token Bucket Rate Limiter' ? OFFICIAL_ROUND2_PLANTED_BUGS : []);

    // Fetch existing identified defects for this team
    const existingReports = await this.prisma.teamBugReport.findMany({
      where: { teamId: teamUser.id, questionId: question.id },
    });
    const identifiedKeySet = new Set(existingReports.map((r) => r.bugKey));

    const selectedText = (dto.selectedText || '').trim();
    const selLine = dto.lineNumber;
    const selStart = dto.startOffset;
    const selEnd = dto.endOffset;

    const formatIdentified = (reports: typeof existingReports) =>
      reports.map((r) => {
        const bugDef = plantedBugs.find((b: any) => b.key === r.bugKey);
        const languageLocations: Record<string, { lineNumber: number; expression: string }> = {};
        for (const lang of ROUND2_SUPPORTED_LANGUAGES) {
          const langBugs =
            (rubric.languagePlantedBugs && rubric.languagePlantedBugs[lang]) ||
            (isOfficialTokenBucket && OFFICIAL_ROUND2_LANGUAGE_BUGS[lang]);
          const matched = Array.isArray(langBugs) ? langBugs.find((b: any) => b.key === r.bugKey) : null;
          if (matched) {
            languageLocations[lang] = { lineNumber: matched.lineNumber, expression: matched.expression };
          }
        }
        return {
          bugKey: r.bugKey,
          selectedText: r.selectedText,
          lineNumber: r.lineNumber,
          startOffset: bugDef?.startOffset ?? null,
          endOffset: bugDef?.endOffset ?? null,
          language: reqLang,
          languageLocations,
          identifiedAt: r.createdAt.toISOString(),
          bugName: bugDef?.name || r.bugKey,
          description: bugDef?.description,
        };
      });

    // 0. Validate Non-Empty, Non-Whitespace, Non-Comment
    if (!selectedText || /^\s*$/.test(selectedText)) {
      return {
        isCorrect: false,
        message: 'Empty or whitespace selection cannot be reported as a defect.',
        identifiedCount: existingReports.length,
        totalRequired: plantedBugs.length,
        isInvestigationComplete: existingReports.length >= plantedBugs.length,
        isRepairUnlocked: existingReports.length >= plantedBugs.length,
        identifiedBugs: formatIdentified(existingReports),
      };
    }

    if (
      selectedText.startsWith('//') ||
      selectedText.startsWith('/*') ||
      selectedText.startsWith('*') ||
      (reqLang === 'python' && selectedText.startsWith('#'))
    ) {
      return {
        isCorrect: false,
        message: 'Comments and documentation cannot be reported as defects.',
        identifiedCount: existingReports.length,
        totalRequired: plantedBugs.length,
        isInvestigationComplete: existingReports.length >= plantedBugs.length,
        isRepairUnlocked: existingReports.length >= plantedBugs.length,
        identifiedBugs: formatIdentified(existingReports),
      };
    }

    // Find which planted bug (if any) matches the contestant's selection
    let matchedBug: (typeof plantedBugs)[0] | null = null;

    // Phase 1: Source Offset Range Match (highest fidelity: exact source character coordinates)
    if (selStart !== undefined && selEnd !== undefined) {
      for (const bug of plantedBugs) {
        if (bug.startOffset !== undefined && bug.endOffset !== undefined) {
          const intersects =
            Math.max(selStart, bug.startOffset - 3) <= Math.min(selEnd, bug.endOffset + 3);

          if (intersects) {
            const acceptable: string[] =
              Array.isArray(bug.acceptableTokens) && bug.acceptableTokens.length > 0
                ? bug.acceptableTokens
                : [bug.expression];

            const isTokenMatch =
              acceptable.some((tok) => {
                const clean = (tok || '').trim();
                if (!clean) return false;
                return (
                  selectedText === clean ||
                  selectedText.includes(clean) ||
                  clean.includes(selectedText)
                );
              }) ||
              bug.expression.includes(selectedText) ||
              selectedText.includes(bug.expression.trim());

            if (isTokenMatch) {
              matchedBug = bug;
              break;
            }
          }
        }
      }
    }

    // Phase 2: Expression & Token Match with Line Disambiguation (used when offsets are not passed)
    if (!matchedBug) {
      for (const bug of plantedBugs) {
        // Line number disambiguation:
        if (bug.key === 'BUG_ILLEGAL_CONSUME_DEDUCTION') {
          // Reject clicks on the valid if-branch (lines 32-35 in clean code, lines 55-58 in old code)
          const isValidBranchLine =
            selLine !== undefined &&
            (selLine === 32 || selLine === 33 || selLine === 34 || selLine === 35 ||
             selLine === 55 || selLine === 56 || selLine === 57 || selLine === 58);
          if (isValidBranchLine) {
            continue;
          }

          const isFaultyBranchLine =
            selLine === undefined ||
            Math.abs(selLine - bug.lineNumber) <= 2 ||
            selLine === 37 ||
            selLine === 38 ||
            selLine === 60 ||
            selLine === 61;

          if (!isFaultyBranchLine) {
            continue;
          }
        } else if (selLine !== undefined) {
          const lineMatches =
            selLine === bug.lineNumber ||
            Math.abs(selLine - bug.lineNumber) <= 1 ||
            (bug.key === 'BUG_INTEGER_TRUNCATION' && (selLine === 38 || selLine === 39 || selLine === 19)) ||
            (bug.key === 'BUG_CLOCK_SKEW_NEGATIVE' && (selLine === 41 || selLine === 42 || selLine === 21 || selLine === 25)) ||
            (bug.key === 'BUG_CAPACITY_OVERFLOW' && (selLine === 42 || selLine === 43 || selLine === 22 || selLine === 26));

          if (!lineMatches) {
            continue;
          }
        }

        const acceptable: string[] =
          Array.isArray(bug.acceptableTokens) && bug.acceptableTokens.length > 0
            ? bug.acceptableTokens
            : [bug.expression];

        const tokenMatch = acceptable.some((token: string) => {
          const clean = (token || '').trim();
          if (!clean) return false;
          if (selectedText === clean) return true;
          if (selectedText.includes(clean) && clean.length >= 4) return true;
          if (selectedText.length >= 4 && clean.includes(selectedText)) return true;
          return false;
        }) || bug.expression.includes(selectedText) || selectedText.includes(bug.expression.trim());

        if (tokenMatch) {
          matchedBug = bug;
          break;
        }
      }
    }

    // Case A: Correct Bug Match Found
    if (matchedBug) {
      // Check if duplicate
      if (identifiedKeySet.has(matchedBug.key)) {
        return {
          isCorrect: false,
          isDuplicate: true,
          bugKey: matchedBug.key,
          bugName: matchedBug.name,
          message: `This defect (${matchedBug.name}) has already been isolated by your team.`,
          identifiedCount: existingReports.length,
          totalRequired: plantedBugs.length,
          isInvestigationComplete: existingReports.length >= plantedBugs.length,
          isRepairUnlocked: existingReports.length >= plantedBugs.length,
          identifiedBugs: formatIdentified(existingReports),
        };
      }

      // Persist newly identified bug
      const newReport = await this.prisma.teamBugReport.create({
        data: {
          teamId: teamUser.id,
          questionId: question.id,
          bugKey: matchedBug.key,
          selectedText: dto.selectedText,
          lineNumber: dto.lineNumber || matchedBug.lineNumber,
          identifiedBy: teamUser.activeParticipant.id,
        },
      });

      const updatedReports = [...existingReports, newReport];
      const newCount = updatedReports.length;
      const isComplete = newCount >= plantedBugs.length;
      const bugIdMarks = Math.round((newCount / plantedBugs.length) * 20 * 100) / 100;

      // Update intermediate score breakdown in progress
      await this.prisma.teamRoundProgress.update({
        where: { id: progress.id },
        data: {
          score: bugIdMarks,
          scoreBreakdown: {
            bugIdentification: bugIdMarks,
            bugsIdentified: newCount,
            totalPlantedBugs: plantedBugs.length,
            stage: isComplete ? 'REPAIR_UNLOCKED' : 'INVESTIGATION',
          },
        },
      });

      // Activity log
      await this.prisma.activityLog.create({
        data: {
          actorType: 'TEAM',
          actorId: teamUser.id,
          action: 'BUG_HUNT_ISOLATE_DEFECT',
          description: `Participant "${teamUser.activeParticipant.fullName}" (${teamUser.teamCode}) isolated defect: ${matchedBug.name} (${newCount}/${plantedBugs.length}).`,
          metadata: {
            teamId: teamUser.id,
            participantId: teamUser.activeParticipant.id,
            bugKey: matchedBug.key,
            bugName: matchedBug.name,
            newCount,
            totalRequired: plantedBugs.length,
          },
        },
      });

      return {
        isCorrect: true,
        isDuplicate: false,
        bugKey: matchedBug.key,
        bugName: matchedBug.name,
        message: `Defect Confirmed: ${matchedBug.name}! (${newCount}/${plantedBugs.length} defects isolated)`,
        identifiedCount: newCount,
        totalRequired: plantedBugs.length,
        isInvestigationComplete: isComplete,
        isRepairUnlocked: isComplete,
        identifiedBugs: formatIdentified(updatedReports),
      };
    }

    // Case B: Incorrect selection
    return {
      isCorrect: false,
      isDuplicate: false,
      message: 'No defect found at the selected token or expression. Review the execution flow and try again.',
      identifiedCount: existingReports.length,
      totalRequired: plantedBugs.length,
      isInvestigationComplete: existingReports.length >= plantedBugs.length,
      isRepairUnlocked: existingReports.length >= plantedBugs.length,
      identifiedBugs: formatIdentified(existingReports),
    };
  }

  /**
   * Contestant: Real execution of repaired code against administrator-configured visible test cases
   */
  async executeBugHuntTest(
    teamUser: AuthTeamUser,
    dto: RunBugHuntTestDto,
  ): Promise<BugHuntTestRunResultDto> {
    await this.verifyActiveParticipantSession(teamUser);
    const { round } = await this.assertRoundAccess(teamUser, 2, 'READ');

    const question = await this.prisma.question.findFirst({
      where: { id: dto.questionId, roundId: round.id },
    });

    if (!question) {
      throw new NotFoundException('Round 2 Bug Hunt question not found.');
    }

    const defaultLang = ROUND2_SUPPORTED_LANGUAGES.includes((question.language || '').toLowerCase() as any)
      ? (question.language || '').toLowerCase()
      : 'c';
    const langKey = (dto.language || defaultLang).toLowerCase();
    if (!ROUND2_SUPPORTED_LANGUAGES.includes(langKey as any)) {
      throw new BadRequestException(
        `Language "${dto.language}" is not supported for Round 2 Bug Hunt. Allowed languages: C (c), C++ (cpp), Java (java), Python (python).`,
      );
    }
    const langConfig = OFFICIAL_JUDGE0_LANGUAGES.find((l) => l.key === langKey)!;

    let stdinToUse = '';
    let expectedOutput: string | null = null;
    const sampleIdx = dto.sampleIndex ?? 0;

    const sampleTestCases = Array.isArray(question.sampleTestCases)
      ? (question.sampleTestCases as Array<{ stdin?: string; expectedOutput?: string; explanation?: string }>)
      : [];

    if (sampleIdx === 99) {
      // Custom Stdin execution
      stdinToUse = dto.customStdin || '';
      expectedOutput = null;
    } else if (sampleTestCases[sampleIdx]) {
      stdinToUse = sampleTestCases[sampleIdx].stdin || '';
      expectedOutput = sampleTestCases[sampleIdx].expectedOutput || '';
    } else if (sampleTestCases.length > 0) {
      stdinToUse = sampleTestCases[0].stdin || '';
      expectedOutput = sampleTestCases[0].expectedOutput || '';
    }

    let codeToExecute = dto.sourceCode;
    if (langConfig.key === 'java') {
      codeToExecute = codeToExecute.replace(/public\s+class\s+[A-Za-z0-9_]+/g, 'public class Main');
    }

    let execRes: any;
    try {
      execRes = await this.judge0Client.execute(
        codeToExecute,
        langConfig.id,
        stdinToUse,
        EXECUTION_LIMITS.DEFAULT_CPU_TIME_LIMIT_SECONDS,
        EXECUTION_LIMITS.DEFAULT_MEMORY_LIMIT_KB,
      );
    } catch (err: any) {
      this.logger.error(`Judge0 execution failed for sample test: ${err.message}`);
      return {
        status: 'RUNTIME_ERROR',
        passed: false,
        sampleIndex: sampleIdx,
        stdin: stdinToUse,
        expectedOutput,
        actualOutput: null,
        compileOutput: null,
        stderr: err?.message || 'Execution service unreachable',
        executionTimeSeconds: null,
        memoryUsageKb: null,
        message: 'Execution Service Unreachable',
        executedAt: new Date().toISOString(),
      };
    }

    const normStatus = this.judge0Client.normalizeStatus(execRes.status);
    const timeNum = execRes.time ? parseFloat(execRes.time) : null;
    const memNum = execRes.memory ? Number(execRes.memory) : null;
    const actualOutput = execRes.stdout ?? '';

    let testStatus: 'ACCEPTED' | 'WRONG_ANSWER' | 'COMPILATION_ERROR' | 'RUNTIME_ERROR' | 'TIME_LIMIT_EXCEEDED' = 'WRONG_ANSWER';
    let testPassed = false;
    let message = 'Output mismatch';

    if (normStatus.isCompilationError) {
      testStatus = 'COMPILATION_ERROR';
      testPassed = false;
      message = 'Compilation Failed';
    } else if (normStatus.isTimeLimitExceeded) {
      testStatus = 'TIME_LIMIT_EXCEEDED';
      testPassed = false;
      message = 'Time Limit Exceeded';
    } else if (normStatus.isRuntimeError) {
      testStatus = 'RUNTIME_ERROR';
      testPassed = false;
      message = 'Runtime Error';
    } else if (normStatus.isSuccess) {
      if (expectedOutput !== null) {
        const normActual = this.normalizeOutput(actualOutput);
        const normExpected = this.normalizeOutput(expectedOutput);
        if (normActual === normExpected) {
          testStatus = 'ACCEPTED';
          testPassed = true;
          message = 'Test Passed';
        } else {
          testStatus = 'WRONG_ANSWER';
          testPassed = false;
          message = 'Wrong Answer (Output Mismatch)';
        }
      } else {
        // Custom Stdin execution
        testStatus = 'ACCEPTED';
        testPassed = true;
        message = 'Execution Succeeded';
      }
    }

    // Real-execution repair verification (never exposes hidden test cases)
    const plantedBugs = (question.plantedBugs as any[]) ||
      (question.title?.includes('Token Bucket') ? OFFICIAL_ROUND2_PLANTED_BUGS : []);
    const isOfficialTokenBucket = question.title?.includes('Token Bucket');
    const hasPerBugVerification =
      isOfficialTokenBucket ||
      plantedBugs.some(
        (b: any) =>
          Array.isArray(b.repairValidationTestIndices) && b.repairValidationTestIndices.length > 0,
      );

    let verifiedBugKeys: string[] = [];
    let sampleTestsPassedCount = testPassed && sampleIdx !== 99 ? 1 : 0;
    const sampleTestsTotalCount = sampleTestCases.length;

    if (!normStatus.isCompilationError && sampleIdx !== 99) {
      // Evaluate all visible sample tests for accurate total sample pass count
      if (sampleTestCases.length > 1) {
        const sampleResults = await Promise.all(
          sampleTestCases.map(async (tc, idx) => {
            if (idx === sampleIdx) return testPassed;
            try {
              const r = await this.judge0Client.execute(
                codeToExecute,
                langConfig.id,
                tc.stdin || '',
                EXECUTION_LIMITS.DEFAULT_CPU_TIME_LIMIT_SECONDS,
                EXECUTION_LIMITS.DEFAULT_MEMORY_LIMIT_KB,
              );
              const st = this.judge0Client.normalizeStatus(r.status);
              return (
                st.isSuccess &&
                this.normalizeOutput(r.stdout ?? '') ===
                  this.normalizeOutput(tc.expectedOutput || '')
              );
            } catch {
              return false;
            }
          }),
        );
        sampleTestsPassedCount = sampleResults.filter(Boolean).length;
      }

      // Evaluate per-bug verification checks via Judge0
      if (isOfficialTokenBucket) {
        const checkResults = await Promise.all(
          OFFICIAL_ROUND2_VERIFICATION_TESTS.map(async (vt) => {
            try {
              const r = await this.judge0Client.execute(
                codeToExecute,
                langConfig.id,
                vt.stdin,
                EXECUTION_LIMITS.DEFAULT_CPU_TIME_LIMIT_SECONDS,
                EXECUTION_LIMITS.DEFAULT_MEMORY_LIMIT_KB,
              );
              const st = this.judge0Client.normalizeStatus(r.status);
              const passed =
                st.isSuccess &&
                this.normalizeOutput(r.stdout ?? '') === this.normalizeOutput(vt.expectedOutput);
              return passed ? vt.bugKey : null;
            } catch {
              return null;
            }
          }),
        );
        verifiedBugKeys = checkResults.filter((k): k is string => Boolean(k));
      } else if (hasPerBugVerification) {
        const allTests = [
          ...sampleTestCases,
          ...(Array.isArray(question.hiddenTestCases) ? (question.hiddenTestCases as any[]) : []),
        ];
        const bugChecks = await Promise.all(
          plantedBugs.map(async (b: any) => {
            const indices: number[] = Array.isArray(b.repairValidationTestIndices)
              ? b.repairValidationTestIndices
              : [];
            if (indices.length === 0) return null;
            for (const tIdx of indices) {
              const tc = allTests[tIdx];
              if (!tc) return null;
              try {
                const r = await this.judge0Client.execute(
                  codeToExecute,
                  langConfig.id,
                  tc.stdin || '',
                  EXECUTION_LIMITS.DEFAULT_CPU_TIME_LIMIT_SECONDS,
                  EXECUTION_LIMITS.DEFAULT_MEMORY_LIMIT_KB,
                );
                const st = this.judge0Client.normalizeStatus(r.status);
                if (
                  !st.isSuccess ||
                  this.normalizeOutput(r.stdout ?? '') !==
                    this.normalizeOutput(tc.expectedOutput || '')
                ) {
                  return null;
                }
              } catch {
                return null;
              }
            }
            return b.key as string;
          }),
        );
        verifiedBugKeys = bugChecks.filter((k): k is string => Boolean(k));
      }
    }

    return {
      status: testStatus,
      passed: testPassed,
      sampleIndex: sampleIdx,
      stdin: stdinToUse,
      expectedOutput,
      actualOutput,
      compileOutput: execRes.compile_output || null,
      stderr: execRes.stderr || null,
      executionTimeSeconds: timeNum,
      memoryUsageKb: memNum,
      message,
      executedAt: new Date().toISOString(),
      verifiedBugKeys,
      repairsVerifiedCount: verifiedBugKeys.length,
      totalBugsCount: plantedBugs.length,
      sampleTestsPassedCount,
      sampleTestsTotalCount,
      hasPerBugVerification,
    };
  }

  // ============================================================================
  // WORKSPACE DRAFTS & CODE SUBMISSIONS (ROUNDS 2 & 3)
  // Strict case draft isolation (Case 1, 2, 3) and independent submission state
  // ============================================================================

  /**
   * Get draft for a team in a specific round and case number
   */
  async getWorkspaceDraft(teamUser: AuthTeamUser, roundNumber: number, caseNumber = 1) {
    const { round, progress, isRoundActive, isPaused, remainingSeconds } =
      await this.assertRoundAccess(teamUser, roundNumber, 'READ');

    const draft = await this.prisma.workspaceDraft.findUnique({
      where: {
        teamId_roundId_caseNumber: {
          teamId: teamUser.id,
          roundId: round.id,
          caseNumber,
        },
      },
    });

    // Default starter code from question if draft does not exist
    let question = null;
    if (roundNumber === 2) {
      const existingReport = await this.prisma.teamBugReport.findFirst({
        where: { teamId: teamUser.id },
        select: { questionId: true },
        orderBy: { createdAt: 'desc' },
      });
      if (existingReport?.questionId) {
        question = await this.prisma.question.findUnique({
          where: { id: existingReport.questionId },
        });
      }
      if (!question) {
        question = await this.prisma.question.findFirst({
          where: { roundId: round.id, isActive: true },
          orderBy: { orderNumber: 'asc' },
        });
      }
    } else {
      question = await this.prisma.question.findFirst({
        where: {
          roundId: round.id,
          caseNumber: roundNumber === 3 ? caseNumber : null,
        },
        orderBy: { orderNumber: 'asc' },
      });
    }

    let isCaseSubmitted = false;
    let submissionId: string | null = null;
    let submittedAt: string | null = null;

    if (roundNumber === 2) {
      if (progress.participationStatus === 'SUBMITTED') {
        isCaseSubmitted = true;
        submittedAt = progress.submittedAt ? progress.submittedAt.toISOString() : null;
        const sub = await this.prisma.submission.findFirst({
          where: { teamId: teamUser.id, roundId: round.id, isTestRun: false },
          orderBy: { submittedAt: 'desc' },
        });
        submissionId = sub?.id || null;
      }
    } else if (roundNumber === 3 && question) {
      const sub = await this.prisma.submission.findFirst({
        where: {
          teamId: teamUser.id,
          roundId: round.id,
          questionId: question.id,
          isTestRun: false,
        },
        orderBy: { submittedAt: 'desc' },
      });
      if (sub) {
        isCaseSubmitted = true;
        submissionId = sub.id;
        submittedAt = sub.submittedAt.toISOString();
      }
    }

    const submittedCaseNumbers: number[] = [];
    if (roundNumber === 3) {
      const round3Questions = await this.prisma.question.findMany({
        where: { roundId: round.id, isActive: true },
      });
      const qIds = round3Questions.map((q) => q.id);
      const subs = await this.prisma.submission.findMany({
        where: {
          teamId: teamUser.id,
          roundId: round.id,
          questionId: { in: qIds },
          isTestRun: false,
        },
        select: { questionId: true },
      });
      const submittedQSet = new Set(subs.map((s) => s.questionId));
      for (const q of round3Questions) {
        if (q.caseNumber && submittedQSet.has(q.id)) {
          submittedCaseNumbers.push(q.caseNumber);
        }
      }
    }

    const isRound2BugHunt = roundNumber === 2;
    const resolvedLanguage = isRound2BugHunt
      ? ROUND2_SUPPORTED_LANGUAGES.includes((draft?.language || '').toLowerCase() as any)
        ? (draft!.language as string).toLowerCase()
        : ROUND2_SUPPORTED_LANGUAGES.includes((question?.language || '').toLowerCase() as any)
          ? (question!.language as string).toLowerCase()
          : 'c'
      : draft?.language && draft.language !== 'typescript'
        ? draft.language
        : question?.language === 'typescript'
          ? 'javascript'
          : question?.language || 'cpp';

    const draftLanguageMap = (draft?.languageDrafts as Record<string, string>) || {};
    const resolvedSourceCode =
      isRound2BugHunt && draftLanguageMap[resolvedLanguage]
        ? draftLanguageMap[resolvedLanguage]
        : draft?.sourceCode
          ? draft.sourceCode
          : isRound2BugHunt
            ? OFFICIAL_ROUND2_LANGUAGE_STARTERS[resolvedLanguage as keyof typeof OFFICIAL_ROUND2_LANGUAGE_STARTERS] ||
              question?.starterCode ||
              '// Write your solution here\n'
            : question?.starterCode || '// Write your solution here\n';

    return {
      sourceCode: resolvedSourceCode,
      language: resolvedLanguage,
      version: draft?.version ?? 0,
      updatedAt: draft?.updatedAt ? draft.updatedAt.toISOString() : new Date().toISOString(),
      isSubmitted: roundNumber === 2 ? progress.participationStatus === 'SUBMITTED' : isCaseSubmitted,
      submissionId,
      submittedAt,
      submittedCases: submittedCaseNumbers,
      isRoundActive,
      isPaused,
      remainingSeconds,
      participationStatus: progress.participationStatus,
    };
  }

  /**
   * Save workspace draft (real-time autosave / sync)
   */
  async saveWorkspaceDraft(
    teamUser: AuthTeamUser,
    roundNumber: number,
    caseNumber: number,
    sourceCode: string,
    language: string,
  ) {
    const { round, progress } = await this.assertRoundAccess(teamUser, roundNumber, 'WRITE');

    if (roundNumber === 2) {
      if (!ROUND2_SUPPORTED_LANGUAGES.includes(language.toLowerCase() as any)) {
        throw new BadRequestException(
          `Language "${language}" is not supported for Round 2 Bug Hunt. Allowed languages: C (c), C++ (cpp), Java (java), Python (python).`,
        );
      }
      if (progress.participationStatus === 'SUBMITTED') {
        throw new BadRequestException('Round 2 has already been submitted by your team.');
      }
      const existingReport = await this.prisma.teamBugReport.findFirst({
        where: { teamId: teamUser.id },
        select: { questionId: true },
        orderBy: { createdAt: 'desc' },
      });
      let r2Q = null;
      if (existingReport?.questionId) {
        r2Q = await this.prisma.question.findUnique({
          where: { id: existingReport.questionId },
        });
      }
      if (!r2Q) {
        r2Q = await this.prisma.question.findFirst({
          where: { roundId: round.id, isActive: true },
          orderBy: { orderNumber: 'asc' },
        });
      }
      if (r2Q) {
        const plantedBugs = (r2Q.plantedBugs as any[]) ||
          (r2Q.title === 'Bug Hunt: Distributed Token Bucket Rate Limiter' ? OFFICIAL_ROUND2_PLANTED_BUGS : []);
        const bugReports = await this.prisma.teamBugReport.findMany({
          where: { teamId: teamUser.id, questionId: r2Q.id },
        });
        if (plantedBugs.length > 0 && bugReports.length < plantedBugs.length) {
          throw new ForbiddenException(
            `Code repair is locked. You must identify all ${plantedBugs.length} defects (${bugReports.length}/${plantedBugs.length} identified) in the Bug Investigation stage before editing code.`,
          );
        }
      }
    }

    if (roundNumber === 3) {
      const question = await this.prisma.question.findFirst({
        where: { roundId: round.id, caseNumber },
      });
      if (question) {
        const existingSub = await this.prisma.submission.findFirst({
          where: { teamId: teamUser.id, roundId: round.id, questionId: question.id, isTestRun: false },
        });
        if (existingSub) {
          throw new BadRequestException(`Case ${caseNumber} has already been submitted and cannot be modified.`);
        }
      }
    }

    const existingDraft = await this.prisma.workspaceDraft.findUnique({
      where: {
        teamId_roundId_caseNumber: {
          teamId: teamUser.id,
          roundId: round.id,
          caseNumber,
        },
      },
      select: { languageDrafts: true },
    });

    const updatedLanguageDrafts = {
      ...((existingDraft?.languageDrafts as Record<string, string>) || {}),
      [language.toLowerCase()]: sourceCode,
    };

    const draft = await this.prisma.workspaceDraft.upsert({
      where: {
        teamId_roundId_caseNumber: {
          teamId: teamUser.id,
          roundId: round.id,
          caseNumber,
        },
      },
      update: {
        sourceCode,
        language,
        languageDrafts: updatedLanguageDrafts,
        version: { increment: 1 },
        lastEditedByParticipantId: teamUser.activeParticipant.id,
        updatedAt: new Date(),
      },
      create: {
        teamId: teamUser.id,
        roundId: round.id,
        caseNumber,
        sourceCode,
        language,
        languageDrafts: updatedLanguageDrafts,
        version: 1,
        lastEditedByParticipantId: teamUser.activeParticipant.id,
      },
    });

    if (progress.participationStatus === 'NOT_STARTED') {
      await this.prisma.teamRoundProgress.update({
        where: { id: progress.id },
        data: {
          participationStatus: 'IN_PROGRESS',
          startedAt: new Date(),
        },
      });
    }

    return {
      success: true,
      version: draft.version,
      updatedAt: draft.updatedAt.toISOString(),
    };
  }

  /**
   * Submit final code for Round 2 or Round 3 case with automated Judge0 evaluation
   */
  async submitCode(
    teamUser: AuthTeamUser,
    roundNumber: number,
    caseNumber: number,
    sourceCode: string,
    language: string,
  ) {
    // 1. Session Mutex Enforcement
    await this.verifyActiveParticipantSession(teamUser);

    // 2. Validate Language
    const langKey = language?.toLowerCase();
    if (roundNumber === 2 && !ROUND2_SUPPORTED_LANGUAGES.includes(langKey as any)) {
      throw new BadRequestException(
        `Language "${language}" is not supported for Round 2 Bug Hunt. Allowed languages: C (c), C++ (cpp), Java (java), Python (python).`,
      );
    }
    const langConfig = OFFICIAL_JUDGE0_LANGUAGES.find((l) => l.key === langKey);
    if (!langConfig) {
      throw new BadRequestException(
        `Language "${language}" is not supported for execution. Supported languages: C (c), C++ (cpp), Java (java), Python (python).`,
      );
    }

    // 3. Validate Source Code Size
    if (Buffer.byteLength(sourceCode, 'utf8') > EXECUTION_LIMITS.MAX_SOURCE_CODE_SIZE_BYTES) {
      throw new BadRequestException(
        `Source code exceeds maximum allowed size of ${EXECUTION_LIMITS.MAX_SOURCE_CODE_SIZE_BYTES / 1024} KB`,
      );
    }

    // 4. Assert Round Access (active status, timer, countdown, pause, eligibility)
    const { round, progress } = await this.assertRoundAccess(teamUser, roundNumber, 'SUBMIT');

    // 5. Resolve Question
    let question = null;
    if (roundNumber === 2) {
      const existingReport = await this.prisma.teamBugReport.findFirst({
        where: { teamId: teamUser.id },
        select: { questionId: true },
        orderBy: { createdAt: 'desc' },
      });
      if (existingReport?.questionId) {
        question = await this.prisma.question.findUnique({
          where: { id: existingReport.questionId },
        });
      }
      if (!question) {
        question = await this.prisma.question.findFirst({
          where: { roundId: round.id, isActive: true },
          orderBy: { orderNumber: 'asc' },
        });
      }
    } else {
      question = await this.prisma.question.findFirst({
        where: {
          roundId: round.id,
          caseNumber: roundNumber === 3 ? caseNumber : null,
        },
        orderBy: { orderNumber: 'asc' },
      });
    }

    // 6. Prevent Duplicate Submissions & Enforce Investigation Completion for Round 2
    if (roundNumber === 2) {
      if (!ROUND2_SUPPORTED_LANGUAGES.includes(language.toLowerCase() as any)) {
        throw new BadRequestException(
          `Language "${language}" is not supported for Round 2 Bug Hunt. Allowed languages: C (c), C++ (cpp), Java (java), Python (python).`,
        );
      }
      if (progress.participationStatus === 'SUBMITTED') {
        throw new BadRequestException('Round 2 has already been submitted by your team.');
      }
      const existingR2Sub = await this.prisma.submission.findFirst({
        where: { teamId: teamUser.id, roundId: round.id, isTestRun: false },
      });
      if (existingR2Sub) {
        throw new BadRequestException('Round 2 has already been submitted by your team.');
      }
      if (question) {
        const plantedBugs = (question.plantedBugs as any[]) ||
          (question.title === 'Bug Hunt: Distributed Token Bucket Rate Limiter' ? OFFICIAL_ROUND2_PLANTED_BUGS : []);
        const bugReports = await this.prisma.teamBugReport.findMany({
          where: { teamId: teamUser.id, questionId: question.id },
        });
        if (plantedBugs.length > 0 && bugReports.length < plantedBugs.length) {
          throw new ForbiddenException(
            `Round 2 submission locked. You must isolate all ${plantedBugs.length} defects (${bugReports.length}/${plantedBugs.length} identified) in the Bug Investigation stage before submitting your repair.`,
          );
        }
      }
    } else if (roundNumber === 3 && question) {
      const existingSub = await this.prisma.submission.findFirst({
        where: { teamId: teamUser.id, roundId: round.id, questionId: question.id, isTestRun: false },
      });
      if (existingSub) {
        throw new BadRequestException(`Case ${caseNumber} has already been submitted by your team.`);
      }
    }

    // 7. Java Normalization: Ensure public class is named Main for Judge0 compatibility
    let codeToExecute = sourceCode;
    if (langConfig.key === 'java') {
      codeToExecute = codeToExecute.replace(/public\s+class\s+[A-Za-z0-9_]+/g, 'public class Main');
    }

    // 8. Assemble Test Cases to Evaluate (both sample and hidden)
    interface EvalTestCase {
      caseIndex: number;
      isHidden: boolean;
      stdin: string;
      expectedOutput: string;
      marks?: number;
    }

    const testCasesToRun: EvalTestCase[] = [];
    let tcIndex = 1;

    const samples = Array.isArray(question?.sampleTestCases)
      ? (question.sampleTestCases as Array<{ stdin?: string; expectedOutput?: string }>)
      : [];
    for (const s of samples) {
      testCasesToRun.push({
        caseIndex: tcIndex++,
        isHidden: false,
        stdin: s.stdin ?? '',
        expectedOutput: s.expectedOutput ?? '',
      });
    }

    const hidden = Array.isArray(question?.hiddenTestCases)
      ? (question.hiddenTestCases as Array<{ stdin?: string; expectedOutput?: string; marks?: number }>)
      : [];
    for (const h of hidden) {
      testCasesToRun.push({
        caseIndex: tcIndex++,
        isHidden: true,
        stdin: h.stdin ?? '',
        expectedOutput: h.expectedOutput ?? '',
        marks: h.marks,
      });
    }

    // Fallback if no test cases configured: run once with empty input
    if (testCasesToRun.length === 0) {
      testCasesToRun.push({
        caseIndex: 1,
        isHidden: false,
        stdin: '',
        expectedOutput: '',
      });
    }

    // 9. Execute Test Cases Against Judge0
    const allTestCaseResults: any[] = [];
    let passedCount = 0;
    let hasCompilationError = false;
    let hasTimeLimitExceeded = false;
    let hasRuntimeError = false;
    let firstCompileOutput: string | null = null;
    let firstStderr: string | null = null;
    let lastStdout: string | null = null;
    let firstToken: string | null = null;
    let maxExecutionTime: number = 0;
    let maxMemoryUsage: number = 0;

    for (const tc of testCasesToRun) {
      let execRes: any;
      try {
        execRes = await this.judge0Client.execute(
          codeToExecute,
          langConfig.id,
          tc.stdin,
          EXECUTION_LIMITS.DEFAULT_CPU_TIME_LIMIT_SECONDS,
          EXECUTION_LIMITS.DEFAULT_MEMORY_LIMIT_KB,
        );
      } catch (err: any) {
        this.logger.error(`Judge0 execution failed for test case ${tc.caseIndex}: ${err.message}`);
        execRes = {
          status: { id: 13, description: 'Internal Error' },
          stdout: null,
          stderr: err?.message || 'Execution service unreachable',
          compile_output: null,
          time: null,
          memory: null,
          token: null,
        };
      }

      if (!firstToken && execRes.token) {
        firstToken = execRes.token;
      }

      const normStatus = this.judge0Client.normalizeStatus(execRes.status);
      const timeNum = execRes.time ? parseFloat(execRes.time) : 0;
      const memNum = execRes.memory ? Number(execRes.memory) : 0;
      if (timeNum > maxExecutionTime) maxExecutionTime = timeNum;
      if (memNum > maxMemoryUsage) maxMemoryUsage = memNum;

      if (execRes.compile_output && !firstCompileOutput) {
        firstCompileOutput = execRes.compile_output;
      }
      if (execRes.stderr && !firstStderr) {
        firstStderr = execRes.stderr;
      }
      if (execRes.stdout) {
        lastStdout = execRes.stdout;
      }

      let casePassed = false;
      let caseStatus = 'WRONG_ANSWER';

      if (normStatus.isCompilationError) {
        hasCompilationError = true;
        caseStatus = 'COMPILATION_ERROR';
        allTestCaseResults.push({
          caseIndex: tc.caseIndex,
          isHidden: tc.isHidden,
          passed: false,
          status: 'COMPILATION_ERROR',
          executionTime: timeNum ? String(timeNum) : null,
          memory: memNum || null,
          stdin: tc.stdin,
          expectedOutput: tc.expectedOutput,
          actualOutput: execRes.stdout || null,
          compileOutput: execRes.compile_output || null,
          stderr: execRes.stderr || null,
        });
        // Stop evaluating further test cases on compilation error
        break;
      } else if (normStatus.isTimeLimitExceeded) {
        hasTimeLimitExceeded = true;
        caseStatus = 'TIME_LIMIT_EXCEEDED';
      } else if (normStatus.isRuntimeError) {
        hasRuntimeError = true;
        caseStatus = 'RUNTIME_ERROR';
      } else if (normStatus.isSuccess) {
        if (tc.expectedOutput) {
          const normActual = this.normalizeOutput(execRes.stdout);
          const normExpected = this.normalizeOutput(tc.expectedOutput);
          if (normActual === normExpected) {
            casePassed = true;
            caseStatus = 'ACCEPTED';
            passedCount++;
          } else {
            caseStatus = 'WRONG_ANSWER';
          }
        } else {
          casePassed = true;
          caseStatus = 'ACCEPTED';
          passedCount++;
        }
      }

      allTestCaseResults.push({
        caseIndex: tc.caseIndex,
        isHidden: tc.isHidden,
        passed: casePassed,
        status: caseStatus,
        executionTime: timeNum ? String(timeNum) : null,
        memory: memNum || null,
        stdin: tc.stdin,
        expectedOutput: tc.expectedOutput,
        actualOutput: execRes.stdout || null,
        compileOutput: execRes.compile_output || null,
        stderr: execRes.stderr || null,
      });
    }

    // 10. Compute Score and Final Submission Status
    const totalQuestionMarks = Number(
      question?.marks ?? (roundNumber === 2 ? 100 : caseNumber === 1 ? 20 : caseNumber === 2 ? 25 : 45),
    );

    let finalSubmissionStatus: 'ACCEPTED' | 'WRONG_ANSWER' | 'COMPILATION_ERROR' | 'RUNTIME_ERROR' | 'TIME_LIMIT_EXCEEDED';
    let calculatedScore = 0;
    let scoreBreakdownToSave: any = null;

    if (roundNumber === 2) {
      // OFFICIAL ROUND 2 SCORING (100 MARKS):
      // - Bug Identification: 20
      // - Test Correctness: 50
      // - Edge Cases: 20
      // - Code Quality: 10
      const bugReports = await this.prisma.teamBugReport.findMany({
        where: { teamId: teamUser.id, questionId: question?.id },
      });
      const plantedBugs = (question?.plantedBugs as any[]) ||
        (question?.title === 'Bug Hunt: Distributed Token Bucket Rate Limiter' ? OFFICIAL_ROUND2_PLANTED_BUGS : []);
      const totalPlanted = Math.max(1, plantedBugs.length);
      const bugIdScore = Math.min(20, Math.round((bugReports.length / totalPlanted) * 20 * 100) / 100);
      let testCorrectnessScore = 0;
      let edgeCasesScore = 0;
      let codeQualityScore = 0;

      const sampleTests = testCasesToRun.filter((tc) => !tc.isHidden);
      const hiddenTests = testCasesToRun.filter((tc) => tc.isHidden);

      const samplePassed = sampleTests.filter((tc) => allTestCaseResults[tc.caseIndex - 1]?.passed).length;
      const hiddenPassed = hiddenTests.filter((tc) => allTestCaseResults[tc.caseIndex - 1]?.passed).length;

      if (hasCompilationError) {
        finalSubmissionStatus = 'COMPILATION_ERROR';
        testCorrectnessScore = 0;
        edgeCasesScore = 0;
        codeQualityScore = 0;
        calculatedScore = bugIdScore; // Retain 20 marks for bug identification
      } else {
        if (sampleTests.length > 0) {
          testCorrectnessScore = Math.round((samplePassed / sampleTests.length) * 50 * 100) / 100;
        }
        if (hiddenTests.length > 0) {
          edgeCasesScore = Math.round((hiddenPassed / hiddenTests.length) * 20 * 100) / 100;
        }
        if (passedCount === testCasesToRun.length && testCasesToRun.length > 0) {
          codeQualityScore = 10;
          finalSubmissionStatus = 'ACCEPTED';
        } else {
          codeQualityScore = 0;
          if (hasTimeLimitExceeded) {
            finalSubmissionStatus = 'TIME_LIMIT_EXCEEDED';
          } else if (hasRuntimeError) {
            finalSubmissionStatus = 'RUNTIME_ERROR';
          } else {
            finalSubmissionStatus = 'WRONG_ANSWER';
          }
        }
        calculatedScore = bugIdScore + testCorrectnessScore + edgeCasesScore + codeQualityScore;
        calculatedScore = Math.min(100, Math.max(0, calculatedScore));
      }

      scoreBreakdownToSave = {
        bugIdentification: bugIdScore,
        testCorrectness: testCorrectnessScore,
        edgeCases: edgeCasesScore,
        codeQuality: codeQualityScore,
        samplePassed,
        totalSampleTests: sampleTests.length,
        hiddenPassed,
        totalHiddenTests: hiddenTests.length,
        totalScore: calculatedScore,
      };
    } else {
      if (hasCompilationError) {
        finalSubmissionStatus = 'COMPILATION_ERROR';
        calculatedScore = 0;
      } else if (passedCount === testCasesToRun.length && testCasesToRun.length > 0) {
        finalSubmissionStatus = 'ACCEPTED';
        calculatedScore = totalQuestionMarks;
      } else {
        if (hasTimeLimitExceeded) {
          finalSubmissionStatus = 'TIME_LIMIT_EXCEEDED';
        } else if (hasRuntimeError) {
          finalSubmissionStatus = 'RUNTIME_ERROR';
        } else {
          finalSubmissionStatus = 'WRONG_ANSWER';
        }
        calculatedScore = Math.round(((passedCount / testCasesToRun.length) * totalQuestionMarks) * 100) / 100;
      }
      scoreBreakdownToSave = {
        testCasesPassed: passedCount,
        totalTestCases: testCasesToRun.length,
        score: calculatedScore,
      };
    }

    const now = new Date();

    // 11. Create or Safely Upsert Persistent Submission Record
    let submission;
    const existingSubmission = await this.prisma.submission.findFirst({
      where: {
        teamId: teamUser.id,
        roundId: round.id,
        ...(roundNumber === 2 ? {} : { questionId: question?.id || null }),
        isTestRun: false,
      },
    });

    if (existingSubmission) {
      submission = await this.prisma.submission.update({
        where: { id: existingSubmission.id },
        data: {
          language: langConfig.key,
          sourceCode,
          stdin: testCasesToRun[0]?.stdin || null,
          stdout: lastStdout,
          stderr: firstStderr,
          compileOutput: firstCompileOutput,
          executionTime: maxExecutionTime > 0 ? String(maxExecutionTime) : null,
          memoryUsage: maxMemoryUsage > 0 ? maxMemoryUsage : null,
          submissionStatus: finalSubmissionStatus,
          score: calculatedScore,
          judge0Token: firstToken,
          testCaseResults: allTestCaseResults,
          submittedAt: now,
          evaluatedAt: now,
        },
      });
    } else {
      submission = await this.prisma.submission.create({
        data: {
          teamId: teamUser.id,
          roundId: round.id,
          questionId: question?.id || null,
          language: langConfig.key,
          sourceCode,
          stdin: testCasesToRun[0]?.stdin || null,
          stdout: lastStdout,
          stderr: firstStderr,
          compileOutput: firstCompileOutput,
          executionTime: maxExecutionTime > 0 ? String(maxExecutionTime) : null,
          memoryUsage: maxMemoryUsage > 0 ? maxMemoryUsage : null,
          submissionStatus: finalSubmissionStatus,
          score: calculatedScore,
          judge0Token: firstToken,
          isTestRun: false,
          testCaseResults: allTestCaseResults,
          submittedAt: now,
          evaluatedAt: now,
        },
      });
    }

    // 12. Update Team Round Progress with Server-Authoritative Score
    if (roundNumber === 2) {
      await this.prisma.teamRoundProgress.update({
        where: { id: progress.id },
        data: {
          participationStatus: 'SUBMITTED',
          submittedAt: now,
          evaluatedAt: now,
          score: calculatedScore,
          scoreBreakdown: scoreBreakdownToSave,
        },
      });
    } else if (roundNumber === 3) {
      const r3Questions = await this.prisma.question.findMany({
        where: { roundId: round.id, isActive: true },
      });
      const totalCases = r3Questions.length || 3;
      const allSubs = await this.prisma.submission.findMany({
        where: { teamId: teamUser.id, roundId: round.id, isTestRun: false },
        select: { questionId: true, score: true },
      });
      const submittedQSet = new Set(allSubs.map((s) => s.questionId));
      const submittedCases: number[] = [];
      for (const q of r3Questions) {
        if (q.caseNumber && submittedQSet.has(q.id)) {
          submittedCases.push(q.caseNumber);
        }
      }
      const isAllCasesSubmitted = submittedCases.length >= totalCases;
      const currentBreakdown = (progress.scoreBreakdown as any) || {};
      const updatedCaseScores: Record<string, number> = {
        ...(currentBreakdown.caseScores || {}),
        [caseNumber]: calculatedScore,
      };
      const totalR3Score: number = Object.values(updatedCaseScores).reduce<number>(
        (sum, val) => sum + Number(val || 0),
        0,
      );

      await this.prisma.teamRoundProgress.update({
        where: { id: progress.id },
        data: {
          participationStatus: isAllCasesSubmitted ? 'SUBMITTED' : 'IN_PROGRESS',
          submittedAt: isAllCasesSubmitted ? now : (progress.submittedAt || null),
          evaluatedAt: now,
          score: totalR3Score,
          scoreBreakdown: {
            ...currentBreakdown,
            submittedCases,
            caseScores: updatedCaseScores,
          },
        },
      });
    }

    // 13. Audit Log
    await this.prisma.activityLog.create({
      data: {
        actorType: 'TEAM',
        actorId: teamUser.id,
        action: 'SUBMIT_CODE',
        description: `Team "${teamUser.teamName}" (${teamUser.teamCode}) submitted code for Round ${roundNumber}${
          roundNumber === 3 ? ` Case ${caseNumber}` : ''
        }. Verdict: ${finalSubmissionStatus}, Score: ${calculatedScore}/${totalQuestionMarks} (${passedCount}/${testCasesToRun.length} test cases passed).`,
        metadata: {
          teamId: teamUser.id,
          roundNumber,
          caseNumber,
          submissionId: submission.id,
          language: langConfig.key,
          status: finalSubmissionStatus,
          score: calculatedScore,
          passedCount,
          totalCount: testCasesToRun.length,
        },
      },
    });

    // 14. Sanitize Test Case Results for Contestant
    // Hidden test cases NEVER leak stdin, expectedOutput, actualOutput, or stderr!
    const sanitizedTestCaseResults = allTestCaseResults.map((tc) => {
      if (tc.isHidden) {
        return {
          caseIndex: tc.caseIndex,
          isHidden: true,
          passed: tc.passed,
          status: tc.status,
          executionTime: tc.executionTime,
          memory: tc.memory,
        };
      }
      return {
        caseIndex: tc.caseIndex,
        isHidden: false,
        passed: tc.passed,
        status: tc.status,
        executionTime: tc.executionTime,
        memory: tc.memory,
        stdin: tc.stdin,
        expectedOutput: tc.expectedOutput,
        actualOutput: tc.actualOutput,
      };
    });

    return {
      submissionId: submission.id,
      status: submission.submissionStatus,
      score: roundNumber === 1 ? calculatedScore : null,
      maximumMarks: roundNumber === 1 ? totalQuestionMarks : null,
      passedTestCases: passedCount,
      totalTestCases: testCasesToRun.length,
      testCaseResults: sanitizedTestCaseResults,
      submittedAt: submission.submittedAt.toISOString(),
      message: finalSubmissionStatus === 'ACCEPTED'
        ? 'All test cases passed successfully!'
        : `Submission evaluated: ${passedCount}/${testCasesToRun.length} test cases passed. Status: ${finalSubmissionStatus}.`,
    };
  }

  /**
   * Anti-Cheating & Participant Monitoring:
   * Records suspicious tab-switch / window blur / focus-lost events during active competition.
   * Debounces duplicate browser events (e.g. visibilitychange + blur firing simultaneously).
   * Enforces official policy: 3 violations trigger immediate session revocation.
   */
  async recordFocusEvent(
    teamUser: AuthTeamUser,
    dto: { roundNumber: number; eventType: 'FOCUS_LOST' | 'TAB_SWITCH' | 'WINDOW_BLUR'; details?: string },
  ) {
    const roundNumber = dto.roundNumber || 1;
    const now = Date.now();
    const participantId = teamUser.activeParticipant?.id || 'unknown-participant';
    const debounceKey = `${teamUser.id}_${participantId}_${roundNumber}`;
    const lastEventTime = this.recentFocusEvents.get(debounceKey) || 0;

    // Debounce within 2000ms to avoid duplicate blur/visibilitychange counts
    if (now - lastEventTime < 2000) {
      return {
        recorded: false,
        debounced: true,
        message: 'Duplicate event suppressed by debounce guard',
      };
    }
    this.recentFocusEvents.set(debounceKey, now);

    // Verify if round is currently active
    const state = await this.prisma.competitionState.findUnique({ where: { id: 'global' } });
    const isRoundActive =
      state?.status === `ROUND_${roundNumber}_ACTIVE` &&
      !state?.isPaused &&
      Boolean(state?.deadlineAt && state.deadlineAt.getTime() > now);

    if (!isRoundActive) {
      return {
        recorded: false,
        isRoundActive: false,
        message: 'Round is not currently active; event ignored',
      };
    }

    // Query existing focus loss warnings for this team in this active round
    const existingLogs = await this.prisma.activityLog.findMany({
      where: {
        actorId: teamUser.id,
        action: 'FOCUS_LOST_WARNING',
      },
      select: { metadata: true },
    });

    const roundViolations = existingLogs.filter((log: any) => {
      const meta = log.metadata as any;
      return meta && Number(meta.roundNumber) === Number(roundNumber);
    });

    const newViolationCount = roundViolations.length + 1;
    const threshold = 3; // official tournament policy threshold

    if (newViolationCount >= threshold) {
      // Exceeded threshold: revoke active session immediately
      if (teamUser.sessionId) {
        await this.prisma.teamSession.updateMany({
          where: { id: teamUser.sessionId, status: 'ACTIVE' },
          data: {
            status: 'REVOKED',
            terminationReason: 'ADMIN_REVOKED',
            logoutAt: new Date(),
          },
        });
      }

      await this.prisma.activityLog.create({
        data: {
          actorType: 'TEAM',
          actorId: teamUser.id,
          action: 'ACCESS_REVOKED',
          description: `Participant "${teamUser.activeParticipant?.fullName || 'Contestant'}" from Team "${teamUser.teamName}" had workspace access revoked due to repeated focus departures (${newViolationCount}/${threshold}) in Round ${roundNumber}.`,
          metadata: {
            roundNumber,
            participantId,
            participantName: teamUser.activeParticipant?.fullName,
            teamName: teamUser.teamName,
            violationCount: newViolationCount,
            threshold,
            eventType: dto.eventType,
            revokedAt: new Date().toISOString(),
          },
        },
      });

      return {
        recorded: true,
        violationCount: newViolationCount,
        threshold,
        revoked: true,
        message: 'Official violation threshold reached. Session access has been revoked.',
      };
    }

    // Record formal warning
    await this.prisma.activityLog.create({
      data: {
        actorType: 'TEAM',
        actorId: teamUser.id,
        action: 'FOCUS_LOST_WARNING',
        description: `Participant "${teamUser.activeParticipant?.fullName || 'Contestant'}" from Team "${teamUser.teamName}" left active workspace in Round ${roundNumber} (Warning ${newViolationCount}/${threshold}).`,
        metadata: {
          roundNumber,
          participantId,
          participantName: teamUser.activeParticipant?.fullName,
          teamName: teamUser.teamName,
          violationCount: newViolationCount,
          threshold,
          eventType: dto.eventType,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return {
      recorded: true,
      violationCount: newViolationCount,
      threshold,
      revoked: false,
      message: 'Workspace departure recorded.',
    };
  }
}
