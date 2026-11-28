import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  AdminSubmissionListItem,
  AdminSubmissionDetailDto,
  GradeSubmissionDto,
  SubmissionStatus,
} from '@ignitron/shared';

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * List submissions for admin inspection
   */
  async listSubmissions(filter: {
    roundNumber?: number;
    teamId?: string;
    status?: SubmissionStatus | string;
  }): Promise<AdminSubmissionListItem[]> {
    const where: any = {
      isTestRun: false,
    };

    if (filter.teamId) {
      where.teamId = filter.teamId;
    }

    let targetRound = null;
    if (filter.roundNumber) {
      targetRound = await this.prisma.competitionRound.findFirst({
        where: { roundNumber: filter.roundNumber },
      });
      if (targetRound) {
        where.roundId = targetRound.id;
      }
    }

    const submissions = await this.prisma.submission.findMany({
      where,
      include: {
        team: {
          select: {
            id: true,
            teamName: true,
            teamCode: true,
            institution: true,
          },
        },
        round: {
          select: {
            roundNumber: true,
          },
        },
        question: {
          select: {
            id: true,
            title: true,
            caseNumber: true,
          },
        },
        evaluations: {
          include: {
            evaluator: {
              select: { fullName: true },
            },
          },
          orderBy: { evaluatedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { submittedAt: 'desc' },
    });

    const items: AdminSubmissionListItem[] = submissions.map((s) => {
      const latestEval = s.evaluations[0];
      const isAutoSubmit = Boolean(
        s.testCaseResults && (s.testCaseResults as any).autoSubmit,
      );

      let calculatedStatus: string;
      if (isAutoSubmit) {
        calculatedStatus = 'TIMEOUT_FINALIZED';
      } else if (
        s.submissionStatus === 'PENDING' ||
        s.submissionStatus === 'EVALUATING'
      ) {
        calculatedStatus = 'PENDING';
      } else {
        calculatedStatus = 'EVALUATED';
      }

      const roundNum = s.round?.roundNumber || 0;
      const questionTitle =
        s.question?.title ||
        (roundNum === 1
          ? 'MCQ Arena (15 Questions)'
          : roundNum === 2
          ? 'Bug Hunt: Distributed Token Bucket Rate Limiter'
          : s.question?.caseNumber
          ? `Event Analytics (Case ${s.question.caseNumber})`
          : 'Final Coding');

      return {
        id: s.id,
        teamId: s.teamId,
        teamName: s.team.teamName,
        teamCode: s.team.teamCode,
        institution: s.team.institution,
        roundNumber: roundNum,
        questionId: s.questionId,
        questionTitle,
        caseNumber: s.question?.caseNumber || null,
        language: s.language || '—',
        submissionStatus: calculatedStatus as any,
        score: s.score !== null ? Number(s.score) : null,
        submittedAt: s.submittedAt ? s.submittedAt.toISOString() : null,
        evaluatedAt: s.evaluatedAt ? s.evaluatedAt.toISOString() : null,
        evaluatorName: latestEval?.evaluator?.fullName || null,
        isAutoSubmit,
        verdict: s.submissionStatus,
      };
    });

    // If viewing a specific round, also include eligible teams that have NO SUBMISSION
    if (targetRound) {
      const roundProgresses = await this.prisma.teamRoundProgress.findMany({
        where: {
          roundId: targetRound.id,
          ...(filter.teamId ? { teamId: filter.teamId } : {}),
        },
        include: {
          team: {
            select: {
              id: true,
              teamName: true,
              teamCode: true,
              institution: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      const submittedTeamIds = new Set(submissions.map((s) => s.teamId));

      for (const prog of roundProgresses) {
        if (!submittedTeamIds.has(prog.teamId)) {
          const roundNum = targetRound.roundNumber;
          const questionTitle =
            roundNum === 1
              ? 'MCQ Arena (15 Questions)'
              : roundNum === 2
              ? 'Bug Hunt: Distributed Token Bucket Rate Limiter'
              : 'Final Coding';

          items.push({
            id: `unsubmitted-${targetRound.id}-${prog.teamId}`,
            teamId: prog.teamId,
            teamName: prog.team.teamName,
            teamCode: prog.team.teamCode,
            institution: prog.team.institution,
            roundNumber: roundNum,
            questionId: null,
            questionTitle,
            caseNumber: null,
            language: '—',
            submissionStatus: 'NO_SUBMISSION',
            score: null,
            submittedAt: null,
            evaluatedAt: null,
            evaluatorName: null,
            isAutoSubmit: false,
            verdict: null,
          });
        }
      }
    }

    // Apply status filter if provided
    if (filter.status && filter.status !== 'all' && filter.status !== 'ALL') {
      const sFilter = filter.status.toUpperCase();
      return items.filter((item) => {
        if (sFilter === 'EVALUATED') {
          return item.submissionStatus === 'EVALUATED';
        }
        if (sFilter === 'PENDING') {
          return item.submissionStatus === 'PENDING';
        }
        if (sFilter === 'TIMEOUT_FINALIZED') {
          return (
            item.submissionStatus === 'TIMEOUT_FINALIZED' ||
            Boolean(item.isAutoSubmit)
          );
        }
        if (sFilter === 'NO_SUBMISSION') {
          return item.submissionStatus === 'NO_SUBMISSION';
        }
        return (
          item.submissionStatus === sFilter ||
          (item.verdict && item.verdict.toUpperCase() === sFilter)
        );
      });
    }

    return items;
  }

  /**
   * Get submission detail for evaluation
   */
  async getSubmissionDetail(id: string): Promise<AdminSubmissionDetailDto> {
    const s = await this.prisma.submission.findUnique({
      where: { id },
      include: {
        team: {
          select: {
            id: true,
            teamName: true,
            teamCode: true,
            institution: true,
          },
        },
        round: {
          select: { roundNumber: true },
        },
        question: {
          select: {
            id: true,
            title: true,
            description: true,
            starterCode: true,
            caseNumber: true,
            rubric: true,
          },
        },
        evaluations: {
          include: {
            evaluator: { select: { fullName: true } },
          },
          orderBy: { evaluatedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!s) {
      throw new NotFoundException(`Submission with ID ${id} not found.`);
    }

    const latestEval = s.evaluations[0];

    let bugReports = null;
    if (s.round?.roundNumber === 2) {
      bugReports = await this.prisma.teamBugReport.findMany({
        where: {
          teamId: s.teamId,
          ...(s.questionId ? { questionId: s.questionId } : {}),
        },
        orderBy: { createdAt: 'asc' },
      });
    }

    const roundNum = s.round?.roundNumber || 0;
    const questionTitle =
      s.question?.title ||
      (roundNum === 1
        ? 'MCQ Arena (15 Questions)'
        : roundNum === 2
        ? 'Bug Hunt: Student Result Analyzer'
        : 'Final Coding');

    const questionDescription =
      s.question?.description ||
      (roundNum === 1
        ? 'Round 1 Multiple Choice Question Arena (15 questions assessing core computer science and programming fundamentals).'
        : roundNum === 2
        ? 'Student Result Analyzer Debugging & Code Repair challenge.'
        : null);

    return {
      id: s.id,
      teamId: s.teamId,
      teamName: s.team.teamName,
      teamCode: s.team.teamCode,
      institution: s.team.institution,
      roundNumber: roundNum,
      questionId: s.questionId,
      questionTitle,
      questionDescription,
      starterCode: s.question?.starterCode || null,
      caseNumber: s.question?.caseNumber || null,
      language: s.language,
      sourceCode: s.sourceCode,
      stdout: s.stdout,
      stderr: s.stderr,
      compileOutput: s.compileOutput,
      submissionStatus: s.submissionStatus as SubmissionStatus,
      score: s.score !== null ? Number(s.score) : null,
      testCaseResults: s.testCaseResults,
      bugReports,
      criteriaScores: (latestEval?.criteriaScores as Record<string, number>) || null,
      feedback: latestEval?.feedback || null,
      submittedAt: s.submittedAt.toISOString(),
      evaluatedAt: s.evaluatedAt ? s.evaluatedAt.toISOString() : null,
      evaluatorName: latestEval?.evaluator?.fullName || null,
    };
  }

  /**
   * Grade a submission with rubric scores and feedback
   */
  async gradeSubmission(submissionId: string, evaluatorId: string, dto: GradeSubmissionDto) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        round: true,
        team: true,
        question: true,
      },
    });

    if (!submission) {
      throw new NotFoundException(`Submission with ID ${submissionId} not found.`);
    }

    const now = new Date();

    // 1. Update Submission record
    await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        score: dto.totalScore,
        submissionStatus: 'EVALUATED',
        evaluatedAt: now,
      },
    });

    // 2. Create Evaluation record
    await this.prisma.evaluation.create({
      data: {
        submissionId,
        evaluatorId,
        teamId: submission.teamId,
        roundNumber: submission.round?.roundNumber,
        totalScore: dto.totalScore,
        criteriaScores: dto.criteriaScores ? (dto.criteriaScores as any) : null,
        feedback: dto.feedback || null,
        evaluatedAt: now,
      },
    });

    // 3. Update TeamRoundProgress
    if (submission.roundId) {
      const progress = await this.prisma.teamRoundProgress.findUnique({
        where: {
          teamId_roundId: {
            teamId: submission.teamId,
            roundId: submission.roundId,
          },
        },
      });

      if (progress) {
        let finalRoundScore = dto.totalScore;
        let scoreBreakdownToSave = dto.criteriaScores ? (dto.criteriaScores as any) : undefined;

        // If Round 3, sum the highest score for each case
        if (submission.round?.roundNumber === 3) {
          const allR3Submissions = await this.prisma.submission.findMany({
            where: {
              teamId: submission.teamId,
              roundId: submission.roundId,
              submissionStatus: 'EVALUATED',
              score: { not: null },
            },
            include: { question: true },
          });

          // Group by caseNumber, take max score per case
          const caseScores = new Map<number, number>();
          for (const sub of allR3Submissions) {
            const cNum = sub.question?.caseNumber || 1;
            const currentMax = caseScores.get(cNum) || 0;
            const subScore = Number(sub.score || 0);
            if (subScore > currentMax) {
              caseScores.set(cNum, subScore);
            }
          }

          const prevBreakdown = (progress.scoreBreakdown as Record<string, any>) || {};
          const cNum = submission.question?.caseNumber || 1;

          // Check if code quality criteria were provided
          let codeQualityAwarded = 0;
          if (dto.criteriaScores) {
            const cqKeys = ['clean_structure', 'data_structures', 'input_validation', 'algorithmic_efficiency', 'edge_cases'];
            for (const k of cqKeys) {
              if (dto.criteriaScores[k] !== undefined) {
                codeQualityAwarded += Number(dto.criteriaScores[k] || 0);
              }
            }
            if (dto.criteriaScores.codeQuality !== undefined) {
              codeQualityAwarded = Number(dto.criteriaScores.codeQuality || 0);
            }
          }
          codeQualityAwarded = Math.min(10, Math.max(0, codeQualityAwarded));

          const case1Score = prevBreakdown.case1Score !== undefined ? Number(prevBreakdown.case1Score) : (caseScores.get(1) || 0);
          const case2Score = prevBreakdown.case2Score !== undefined ? Number(prevBreakdown.case2Score) : (caseScores.get(2) || 0);
          const case3Score = prevBreakdown.case3Score !== undefined ? Number(prevBreakdown.case3Score) : (caseScores.get(3) || 0);
          const cqScore = codeQualityAwarded > 0 ? codeQualityAwarded : Number(prevBreakdown.codeQuality || 0);

          finalRoundScore = Math.min(100, Math.max(0, case1Score + case2Score + case3Score + cqScore));

          scoreBreakdownToSave = {
            ...prevBreakdown,
            [`case${cNum}`]: dto.totalScore,
            [`case${cNum}Criteria`]: dto.criteriaScores,
            caseScores: Object.fromEntries(caseScores),
            case1Score,
            case2Score,
            case3Score,
            codeQuality: cqScore,
            codeQualityCriteria: dto.criteriaScores,
            totalScore: finalRoundScore,
          };
        }

        await this.prisma.teamRoundProgress.update({
          where: { id: progress.id },
          data: {
            score: finalRoundScore,
            evaluatedAt: now,
            scoreBreakdown: scoreBreakdownToSave,
          },
        });
      }
    }

    // 4. Activity Log
    await this.prisma.activityLog.create({
      data: {
        actorType: 'ADMIN',
        actorId: evaluatorId,
        action: 'GRADE_SUBMISSION',
        description: `Graded submission for team "${submission.team.teamName}" in Round ${
          submission.round?.roundNumber
        }. Score: ${dto.totalScore}.`,
        metadata: {
          submissionId,
          teamId: submission.teamId,
          totalScore: dto.totalScore,
          criteriaScores: dto.criteriaScores,
        },
      },
    });

    return {
      success: true,
      message: `Submission graded successfully with score ${dto.totalScore}.`,
      submissionId,
      score: dto.totalScore,
    };
  }

  /**
   * Admin inspection of a team's Round 1 MCQ answers
   */
  async getTeamMcqReview(teamId: string) {
    const round = await this.prisma.competitionRound.findFirst({
      where: { roundNumber: 1 },
    });
    if (!round) {
      throw new NotFoundException('Round 1 not found.');
    }

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, teamName: true, teamCode: true, institution: true },
    });
    if (!team) {
      throw new NotFoundException(`Team ${teamId} not found.`);
    }

    const progress = await this.prisma.teamRoundProgress.findUnique({
      where: { teamId_roundId: { teamId, roundId: round.id } },
    });

    const questions = await this.prisma.question.findMany({
      where: { roundId: round.id, isActive: true },
      orderBy: { orderNumber: 'asc' },
    });

    const teamAnswers = await this.prisma.teamMcqAnswer.findMany({
      where: { teamId },
    });

    const answersMap = new Map<string, { selectedOption: number | null; isFlagged: boolean }>();
    for (const a of teamAnswers) {
      answersMap.set(a.questionId, { selectedOption: a.selectedOption, isFlagged: a.isFlagged });
    }

    const reviewQuestions = questions.map((q) => {
      const userAns = answersMap.get(q.id);
      const isCorrect =
        userAns?.selectedOption !== null &&
        userAns?.selectedOption !== undefined &&
        userAns.selectedOption === q.correctOption;

      return {
        questionId: q.id,
        orderNumber: q.orderNumber,
        title: q.title,
        description: q.description,
        options: q.options as string[],
        correctOption: q.correctOption,
        explanation: q.explanation,
        marks: Number(q.marks),
        selectedOption: userAns ? userAns.selectedOption : null,
        isFlagged: userAns ? userAns.isFlagged : false,
        isCorrect,
      };
    });

    return {
      team,
      roundNumber: 1,
      score: progress ? Number(progress.score) : 0,
      participationStatus: progress?.participationStatus || 'NOT_STARTED',
      submittedAt: progress?.submittedAt ? progress.submittedAt.toISOString() : null,
      totalQuestions: questions.length,
      correctCount: reviewQuestions.filter((q) => q.isCorrect).length,
      questions: reviewQuestions,
    };
  }
}

