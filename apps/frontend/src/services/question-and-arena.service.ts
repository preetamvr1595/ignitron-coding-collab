import { apiClient } from './api';
import {
  QuestionDto,
  SanitizedQuestionDto,
  CreateQuestionDto,
  UpdateQuestionDto,
  McqArenaStateDto,
  SaveMcqAnswerDto,
  SubmitMcqAnswersDto,
  McqSubmissionResultDto,
  AdminSubmissionListItem,
  AdminSubmissionDetailDto,
  GradeSubmissionDto,
  BugHuntArenaStateDto,
  ReportBugDto,
  ReportBugResultDto,
  RunBugHuntTestDto,
  BugHuntTestRunResultDto,
  AnalyticsArenaStateDto,
  DatasetMetaDto,
  AnalyticsSubmissionResultDto,
  FocusEventResultDto,
} from '@ignitron/shared';

export interface ApiResponseWrapper<T> {
  success: boolean;
  data: T;
  message?: string;
}

export const questionAndArenaService = {
  // --------------------------------------------------------------------------
  // ADMIN QUESTIONS
  // --------------------------------------------------------------------------
  async listAdminQuestions(
    roundNumber?: number,
    type?: string,
    includeInactive = false,
  ): Promise<QuestionDto[]> {
    const params = new URLSearchParams();
    if (roundNumber) params.append('roundNumber', roundNumber.toString());
    if (type) params.append('type', type);
    if (includeInactive) params.append('includeInactive', 'true');
    const queryString = params.toString() ? `?${params.toString()}` : '';

    const res = await apiClient<ApiResponseWrapper<QuestionDto[]>>(
      `/competition/questions${queryString}`,
    );
    return res.data;
  },

  async getAdminQuestion(id: string): Promise<QuestionDto> {
    const res = await apiClient<ApiResponseWrapper<QuestionDto>>(
      `/competition/questions/${id}`,
    );
    return res.data;
  },

  async createQuestion(dto: CreateQuestionDto): Promise<QuestionDto> {
    const res = await apiClient<ApiResponseWrapper<QuestionDto>>('/competition/questions', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    return res.data;
  },

  async updateQuestion(id: string, dto: UpdateQuestionDto): Promise<QuestionDto> {
    const res = await apiClient<ApiResponseWrapper<QuestionDto>>(
      `/competition/questions/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(dto),
      },
    );
    return res.data;
  },

  async togglePublish(id: string, isActive: boolean): Promise<QuestionDto> {
    return this.updateQuestion(id, { isActive });
  },

  async deleteQuestion(id: string): Promise<{ success: boolean; message: string }> {
    const res = await apiClient<{ success: boolean; message: string }>(
      `/competition/questions/${id}`,
      {
        method: 'DELETE',
      },
    );
    return res;
  },

  async seedQuestions(): Promise<{ seededCount: number; message: string }> {
    const res = await apiClient<ApiResponseWrapper<{ seededCount: number; message: string }>>(
      '/competition/questions/seed',
      {
        method: 'POST',
      },
    );
    return res.data;
  },

  // --------------------------------------------------------------------------
  // CONTESTANT ARENA & SANITIZED QUESTIONS
  // --------------------------------------------------------------------------
  async getQuestionsForRound(roundNumber: number): Promise<SanitizedQuestionDto[]> {
    const res = await apiClient<ApiResponseWrapper<SanitizedQuestionDto[]>>(
      `/competition/questions/round/${roundNumber}`,
    );
    return res.data;
  },

  async checkRoundAccess(roundNumber: number): Promise<{
    roundNumber: number;
    eligibilityStatus: string;
    participationStatus: string;
    isRoundActive: boolean;
    isPaused: boolean;
    remainingSeconds: number;
  }> {
    const res = await apiClient<ApiResponseWrapper<{
      roundNumber: number;
      eligibilityStatus: string;
      participationStatus: string;
      isRoundActive: boolean;
      isPaused: boolean;
      remainingSeconds: number;
    }>>(`/arena/status/${roundNumber}`);
    return res.data;
  },

  async getMcqArenaState(): Promise<McqArenaStateDto> {
    const res = await apiClient<ApiResponseWrapper<McqArenaStateDto>>('/arena/mcq/state');
    return res.data;
  },

  async saveMcqAnswer(dto: SaveMcqAnswerDto) {
    const res = await apiClient<ApiResponseWrapper<any>>('/arena/mcq/save', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    return res.data;
  },

  async submitMcqRound(dto?: SubmitMcqAnswersDto): Promise<McqSubmissionResultDto> {
    const res = await apiClient<ApiResponseWrapper<McqSubmissionResultDto>>(
      '/arena/mcq/submit',
      {
        method: 'POST',
        body: JSON.stringify(dto || {}),
      },
    );
    return res.data;
  },

  // --------------------------------------------------------------------------
  // ROUND 2 BUG HUNT ARENA
  // --------------------------------------------------------------------------
  async getBugHuntState(): Promise<BugHuntArenaStateDto> {
    const res = await apiClient<ApiResponseWrapper<BugHuntArenaStateDto>>('/arena/bug-hunt/state');
    return res.data;
  },

  async runBugHuntTest(dto: RunBugHuntTestDto): Promise<BugHuntTestRunResultDto> {
    const res = await apiClient<ApiResponseWrapper<BugHuntTestRunResultDto>>('/arena/bug-hunt/test-run', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    return res.data;
  },

  async reportBug(dto: ReportBugDto): Promise<ReportBugResultDto> {
    const res = await apiClient<ApiResponseWrapper<ReportBugResultDto>>('/arena/bug-hunt/report-bug', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    return res.data;
  },

  async getWorkspaceDraft(roundNumber: number, caseNumber = 1) {
    const res = await apiClient<ApiResponseWrapper<{
      sourceCode: string;
      language: string;
      version: number;
      updatedAt: string;
    }>>(`/arena/workspace/draft?roundNumber=${roundNumber}&caseNumber=${caseNumber}`);
    return res.data;
  },

  async saveWorkspaceDraft(payload: {
    roundNumber: number;
    caseNumber?: number;
    sourceCode: string;
    language: string;
  }) {
    const res = await apiClient<ApiResponseWrapper<any>>('/arena/workspace/draft', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async submitWorkspaceCode(payload: {
    roundNumber: number;
    caseNumber?: number;
    sourceCode: string;
    language: string;
  }) {
    const res = await apiClient<ApiResponseWrapper<{
      submissionId: string;
      status: string;
      submittedAt: string;
      message: string;
    }>>('/arena/workspace/submit', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  // --------------------------------------------------------------------------
  // ADMIN EVALUATION & SUBMISSIONS
  // --------------------------------------------------------------------------
  async listSubmissions(params?: {
    roundNumber?: number;
    teamId?: string;
    status?: string;
  }): Promise<AdminSubmissionListItem[]> {
    const qp = new URLSearchParams();
    if (params?.roundNumber) qp.append('roundNumber', params.roundNumber.toString());
    if (params?.teamId) qp.append('teamId', params.teamId);
    if (params?.status) qp.append('status', params.status);
    const queryString = qp.toString() ? `?${qp.toString()}` : '';

    const res = await apiClient<ApiResponseWrapper<AdminSubmissionListItem[]>>(
      `/competition/evaluation/submissions${queryString}`,
    );
    return res.data;
  },

  async getSubmissionDetail(id: string): Promise<AdminSubmissionDetailDto> {
    const res = await apiClient<ApiResponseWrapper<AdminSubmissionDetailDto>>(
      `/competition/evaluation/submissions/${id}`,
    );
    return res.data;
  },

  async gradeSubmission(id: string, dto: GradeSubmissionDto) {
    const res = await apiClient<ApiResponseWrapper<{
      success: boolean;
      message: string;
      submissionId: string;
      score: number;
    }>>(`/competition/evaluation/submissions/${id}/grade`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    return res.data;
  },

  async getTeamMcqReview(teamId: string) {
    const res = await apiClient<ApiResponseWrapper<{
      team: { id: string; teamName: string; teamCode: string; institution?: string | null };
      roundNumber: number;
      score: number;
      participationStatus: string;
      submittedAt: string | null;
      totalQuestions: number;
      correctCount: number;
      questions: Array<{
        questionId: string;
        orderNumber: number;
        title: string;
        description: string;
        options: string[];
        correctOption: number;
        explanation?: string | null;
        marks: number;
        selectedOption: number | null;
        isFlagged: boolean;
        isCorrect: boolean;
      }>;
    }>>(`/competition/evaluation/teams/${teamId}/mcq`);
    return res.data;
  },

  // --------------------------------------------------------------------------
  // ROUND 3: EVENT ANALYTICS ARENA
  // --------------------------------------------------------------------------
  async getAnalyticsArenaState(): Promise<AnalyticsArenaStateDto> {
    const res = await apiClient<ApiResponseWrapper<AnalyticsArenaStateDto>>(
      '/arena/analytics/state',
    );
    return res.data;
  },

  async getDatasetMeta(): Promise<DatasetMetaDto> {
    const res = await apiClient<ApiResponseWrapper<DatasetMetaDto>>(
      '/arena/analytics/dataset-meta',
    );
    return res.data;
  },

  async getDatasetPreview(
    filename: string,
    page = 1,
    limit = 20,
    search?: string,
  ): Promise<{
    totalRows: number;
    page: number;
    limit: number;
    totalPages: number;
    columns: string[];
    rows: Record<string, any>[];
  }> {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    if (search && search.trim()) params.append('search', search.trim());

    const res = await apiClient<ApiResponseWrapper<{
      totalRows: number;
      page: number;
      limit: number;
      totalPages: number;
      columns: string[];
      rows: Record<string, any>[];
    }>>(`/arena/analytics/dataset-preview/${filename}?${params.toString()}`);
    return res.data;
  },

  getDatasetDownloadUrl(filename: string): string {
    return `/api/arena/analytics/dataset-download/${filename}`;
  },

  async saveAnalyticsDraft(questionId: string, sourceCode: string) {
    const res = await apiClient<ApiResponseWrapper<{
      success: boolean;
      caseNumber: number;
      version: number;
      updatedAt: string;
    }>>('/arena/analytics/draft', {
      method: 'POST',
      body: JSON.stringify({ questionId, sourceCode }),
    });
    return res.data;
  },

  async selectAnalyticsOption(questionId: string, selectedOption: 'A' | 'B' | 'C' | 'D') {
    const res = await apiClient<ApiResponseWrapper<{
      success: boolean;
      questionId: string;
      selectedOption: string;
      savedAt: string;
    }>>('/arena/analytics/select-option', {
      method: 'POST',
      body: JSON.stringify({ questionId, selectedOption }),
    });
    return res.data;
  },

  async testRunAnalytics(questionId: string, sourceCode: string) {
    const res = await apiClient<ApiResponseWrapper<{
      passedTests: number;
      totalTests: number;
      allPassed: boolean;
      testCaseResults: any[];
    }>>('/arena/analytics/test-run', {
      method: 'POST',
      body: JSON.stringify({ questionId, sourceCode }),
    });
    return res.data;
  },

  async submitAnalyticsQuestion(
    questionId: string,
    selectedOption?: 'A' | 'B' | 'C' | 'D',
    sourceCode?: string,
  ): Promise<AnalyticsSubmissionResultDto> {
    const res = await apiClient<ApiResponseWrapper<AnalyticsSubmissionResultDto>>(
      '/arena/analytics/submit-question',
      {
        method: 'POST',
        body: JSON.stringify({ questionId, selectedOption, sourceCode }),
      },
    );
    return res.data;
  },

  async submitAnalyticsCase(
    caseNumber: 1 | 2 | 3,
    answers: Array<{ questionId: string; selectedOption: 'A' | 'B' | 'C' | 'D' }>,
  ): Promise<{
    success: boolean;
    caseNumber: number;
    submittedQuestionIds: string[];
    message: string;
    submittedAt: string;
  }> {
    const res = await apiClient<
      ApiResponseWrapper<{
        success: boolean;
        caseNumber: number;
        submittedQuestionIds: string[];
        message: string;
        submittedAt: string;
      }>
    >('/arena/analytics/submit-case', {
      method: 'POST',
      body: JSON.stringify({ caseNumber, answers }),
    });
    return res.data;
  },

  async finalizeRound3(): Promise<{
    success: boolean;
    message: string;
    totalScore: number;
    submittedAt?: string;
  }> {
    const res = await apiClient<ApiResponseWrapper<{
      success: boolean;
      message: string;
      totalScore: number;
      submittedAt?: string;
    }>>('/arena/analytics/finalize', {
      method: 'POST',
    });
    return res.data;
  },
  async recordFocusEvent(
    roundNumber: number,
    eventType: 'FOCUS_LOST' | 'TAB_SWITCH' | 'WINDOW_BLUR' = 'FOCUS_LOST',
    details?: string,
  ): Promise<FocusEventResultDto> {
    const res = await apiClient<ApiResponseWrapper<FocusEventResultDto>>(
      '/arena/monitor/focus-event',
      {
        method: 'POST',
        body: JSON.stringify({ roundNumber, eventType, details }),
      },
    );
    return res.data;
  },
};