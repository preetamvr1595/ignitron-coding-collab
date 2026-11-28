import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Database,
  Send,
  AlertTriangle,
  Loader2,
  Clock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  Trophy,
  Check,
  Lock,
  PauseCircle,
  ShieldAlert,
  FileSpreadsheet,
  Flag,
  Code2,
  BookOpen,
  BarChart3,
  CircleDot,
  Flame,
  Table2,
  ArrowRight,
} from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import { questionAndArenaService } from '../../services/question-and-arena.service';
import { useCompetitionState, useServerTimer } from '../../hooks/useCompetition';
import { useParticipantMonitoring } from '../../hooks/useParticipantMonitoring';
import { ExamLockOverlay } from '../../components/competition/ExamLockOverlay';
import {
  AnalyticsArenaStateDto,
  AnalyticsQuestionDto,
} from '@ignitron/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Dataset registry (metadata + fallback preview)
// ─────────────────────────────────────────────────────────────────────────────
export interface DatasetDef {
  fileName: string;
  dfName: string;
  title: string;
  description: string;
  columns: string[];
  previewRows: Record<string, any>[];
  fieldInfo: { field: string; type: string; desc: string }[];
}

export const DATASET_REGISTRY: Record<string, DatasetDef> = {
  'IGNITRON_Round3_Reference_Dataset.json': {
    fileName: 'IGNITRON_Round3_Reference_Dataset.json',
    dfName: 'reference_json',
    title: 'IGNITRON Round 3 Reference Dataset (Master JSON)',
    description:
      'Complete JSON dataset with participant_scores (100), submission_status_summary (1,000), submission_ids (1,000), team_leaderboard (50), team_round_scores (50), and verification metrics.',
    columns: ['section', 'record_count', 'description', 'verified_highlight'],
    previewRows: [
      { section: 'participant_scores', record_count: 100, description: 'All participants and their round scores.', verified_highlight: 'P101 total=207.4; Highest=P196 (217.2)' },
      { section: 'submission_status_summary', record_count: 1000, description: 'Submission count by execution status.', verified_highlight: 'ACCEPTED=302 / 1000' },
      { section: 'submission_ids', record_count: 1000, description: 'All submission IDs; use to check for duplicates.', verified_highlight: 'Duplicates=0' },
      { section: 'team_leaderboard', record_count: 50, description: 'All 50 teams sorted by total score descending.', verified_highlight: 'Rank 1=T148 (Syntax Ninjas, 425.6)' },
      { section: 'team_round_scores', record_count: 50, description: 'Team round-wise scores for ranking and tie-break.', verified_highlight: 'Totals match leaderboard=true' },
    ],
    fieldInfo: [
      { field: 'dataset_name', type: 'string', desc: 'IGNITRON Round 3 Reference Dataset' },
      { field: 'sections.participant_scores', type: 'object (100)', desc: 'Per-participant round_1_score, round_2_score, round_3_score, total_score' },
      { field: 'sections.submission_status_summary', type: 'object (5)', desc: 'Counts for ACCEPTED, COMPILATION_ERROR, RUNTIME_ERROR, TIME_LIMIT_EXCEEDED, WRONG_ANSWER' },
      { field: 'sections.submission_ids', type: 'object (1,000)', desc: 'List of submission_id strings SUB_10001..SUB_11000' },
      { field: 'sections.team_leaderboard', type: 'object (50)', desc: 'Ranked teams with rank, team_id, team_name, department, scores, total_score' },
      { field: 'sections.team_round_scores', type: 'object (50)', desc: 'team_id, team_name, total_score, round_2_score, round_3_score' },
      { field: 'verification', type: 'object (10)', desc: 'Ground-truth verification values' },
    ],
  },
  'participants.csv': {
    fileName: 'participants.csv',
    dfName: 'df',
    title: 'Participant Scores (100 Records)',
    description: 'Participant IDs, names, and Round 1, 2, 3 scores across all 100 contestants.',
    columns: ['participant_id', 'participant_name', 'round_1_score', 'round_2_score', 'round_3_score', 'total_score'],
    previewRows: [
      { participant_id: 'P101', participant_name: 'Akash Patel', round_1_score: 25.4, round_2_score: 87.4, round_3_score: 94.6, total_score: 207.4 },
      { participant_id: 'P102', participant_name: 'Vikram Chauhan', round_1_score: 22.7, round_2_score: 78.5, round_3_score: 67.7, total_score: 168.9 },
      { participant_id: 'P170', participant_name: 'Priya Sharma', round_1_score: 28.1, round_2_score: 91.2, round_3_score: 96.8, total_score: 216.1 },
      { participant_id: 'P196', participant_name: 'Neha Singh', round_1_score: 29.0, round_2_score: 96.4, round_3_score: 91.8, total_score: 217.2 },
    ],
    fieldInfo: [
      { field: 'participant_id', type: 'string (PK)', desc: 'Unique participant identifier (P101–P200)' },
      { field: 'participant_name', type: 'string', desc: 'Full name of the participant' },
      { field: 'round_1_score', type: 'float', desc: 'Raw score in Round 1' },
      { field: 'round_2_score', type: 'float', desc: 'Raw score in Round 2' },
      { field: 'round_3_score', type: 'float', desc: 'Raw score in Round 3' },
      { field: 'total_score', type: 'float', desc: 'Sum of all round scores' },
    ],
  },
  'submission_ids.csv': {
    fileName: 'submission_ids.csv',
    dfName: 'ids',
    title: 'Submission IDs (1,000 Records)',
    description: 'All 1,000 unique submission IDs from SUB_10001 to SUB_11000.',
    columns: ['submission_id'],
    previewRows: [
      { submission_id: 'SUB_10001' },
      { submission_id: 'SUB_10002' },
      { submission_id: 'SUB_10003' },
      { submission_id: 'SUB_10004' },
    ],
    fieldInfo: [
      { field: 'submission_id', type: 'string (PK)', desc: 'Unique submission identifier (SUB_10001..SUB_11000). No duplicates.' },
    ],
  },
  'submission_status_summary.csv': {
    fileName: 'submission_status_summary.csv',
    dfName: 'summary',
    title: 'Submission Status Summary (5 Statuses)',
    description: 'Count of 1,000 submissions grouped by execution status.',
    columns: ['execution_status', 'count'],
    previewRows: [
      { execution_status: 'ACCEPTED', count: 302 },
      { execution_status: 'WRONG_ANSWER', count: 192 },
      { execution_status: 'COMPILATION_ERROR', count: 184 },
      { execution_status: 'RUNTIME_ERROR', count: 178 },
      { execution_status: 'TIME_LIMIT_EXCEEDED', count: 144 },
    ],
    fieldInfo: [
      { field: 'execution_status', type: 'string', desc: 'One of ACCEPTED, WRONG_ANSWER, COMPILATION_ERROR, RUNTIME_ERROR, TIME_LIMIT_EXCEEDED' },
      { field: 'count', type: 'integer', desc: 'Number of submissions with this status (total = 1,000)' },
    ],
  },
  'team_leaderboard.csv': {
    fileName: 'team_leaderboard.csv',
    dfName: 'leaderboard',
    title: 'Team Leaderboard (50 Teams)',
    description: 'All 50 teams sorted by total score descending with rank, department and round scores.',
    columns: ['rank', 'team_id', 'team_name', 'department', 'total_score'],
    previewRows: [
      { rank: 1, team_id: 'T148', team_name: 'Syntax Ninjas', department: 'Computer Science & Engineering', total_score: 425.6 },
      { rank: 2, team_id: 'T147', team_name: 'Recursion Crusaders', department: 'Artificial Intelligence & Data Science', total_score: 402.6 },
      { rank: 3, team_id: 'T118', team_name: 'Code Architects', department: 'Information Technology', total_score: 388.9 },
      { rank: 4, team_id: 'T122', team_name: 'Omega Wolves', department: 'Electronics & Communication', total_score: 384.8 },
    ],
    fieldInfo: [
      { field: 'rank', type: 'integer', desc: 'Team rank (1 = highest total_score)' },
      { field: 'team_id', type: 'string (PK)', desc: 'Team identifier (T101–T150)' },
      { field: 'team_name', type: 'string', desc: 'Registered team name' },
      { field: 'department', type: 'string', desc: 'Academic department' },
      { field: 'total_score', type: 'float', desc: 'Primary ranking key (descending)' },
    ],
  },
  'team_round_scores.csv': {
    fileName: 'team_round_scores.csv',
    dfName: 'scores',
    title: 'Team Round Scores (50 Records)',
    description: 'Per-team total_score, round_3_score and round_2_score for multi-key ranking.',
    columns: ['team_id', 'team_name', 'total_score', 'round_2_score', 'round_3_score'],
    previewRows: [
      { team_id: 'T148', team_name: 'Syntax Ninjas', total_score: 425.6, round_2_score: 197.9, round_3_score: 176.7 },
      { team_id: 'T147', team_name: 'Recursion Crusaders', total_score: 402.6, round_2_score: 179.3, round_3_score: 172.0 },
      { team_id: 'T118', team_name: 'Code Architects', total_score: 388.9, round_2_score: 161.4, round_3_score: 180.6 },
    ],
    fieldInfo: [
      { field: 'team_id', type: 'string (PK)', desc: 'Team identifier (T101–T150)' },
      { field: 'team_name', type: 'string', desc: 'Registered team name' },
      { field: 'total_score', type: 'float', desc: 'Primary ranking key (descending)' },
      { field: 'round_2_score', type: 'float', desc: 'Tertiary tie-break key (descending)' },
      { field: 'round_3_score', type: 'float', desc: 'Secondary tie-break key (descending)' },
    ],
  },
  'verification_summary.csv': {
    fileName: 'verification_summary.csv',
    dfName: 'verification',
    title: 'Verification Summary (10 Metrics)',
    description: 'Official ground-truth verification metrics matching the master JSON.',
    columns: ['metric', 'value'],
    previewRows: [
      { metric: 'participant_count', value: '100' },
      { metric: 'team_count', value: '50' },
      { metric: 'submission_count', value: '1000' },
      { metric: 'duplicate_submission_id_count', value: '0' },
      { metric: 'p101_total_score', value: '207.4' },
      { metric: 'accepted_submission_count', value: '302' },
    ],
    fieldInfo: [
      { field: 'metric', type: 'string', desc: 'Verification metric key' },
      { field: 'value', type: 'string/JSON', desc: 'Exact verified reference value' },
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Python syntax highlighter
// ─────────────────────────────────────────────────────────────────────────────
function highlightPython(code: string): React.ReactNode {
  if (!code) return null;
  const lines = code.split('\n');
  let key = 0;
  const tokenize = (src: string): React.ReactNode[] => {
    const result: React.ReactNode[] = [];
    const combined =
      /(#[^\n]*)|("""[\s\S]*?"""|'''[\s\S]*?'''|"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*')|\b(def|return|print|for|in|if|elif|else|import|from|as|pass|break|continue|class|lambda|and|or|not|True|False|None|with|yield|raise|try|except|finally|while|del|global|nonlocal|assert|is)\b|\b(len|sum|max|min|sorted|list|dict|set|tuple|int|float|str|bool|range|enumerate|zip|map|filter|round|abs|type|isinstance|hasattr|getattr)\b|\b(\d+\.?\d*)\b/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = combined.exec(src)) !== null) {
      if (m.index > last) result.push(<span key={key++}>{src.slice(last, m.index)}</span>);
      if (m[1]) result.push(<span key={key++} className="text-emerald-400/75 italic">{m[1]}</span>);
      else if (m[2]) result.push(<span key={key++} className="text-amber-300">{m[2]}</span>);
      else if (m[3]) result.push(<span key={key++} className="text-violet-300 font-semibold">{m[3]}</span>);
      else if (m[4]) result.push(<span key={key++} className="text-sky-300">{m[4]}</span>);
      else if (m[5]) result.push(<span key={key++} className="text-orange-300">{m[5]}</span>);
      last = combined.lastIndex;
    }
    if (last < src.length) result.push(<span key={key++}>{src.slice(last)}</span>);
    return result;
  };
  return (
    <>
      {lines.map((line, li) => (
        <span key={li} className="block leading-[1.6]">
          {tokenize(line)}
        </span>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Nav tab types
// ─────────────────────────────────────────────────────────────────────────────
type NavTab = 'DATASET' | 'CASE_1' | 'CASE_2' | 'CASE_3';

const NAV_TABS: Array<{ id: NavTab; label: string; subtitle: string; num?: string; caseNumber?: 1 | 2 | 3 }> = [
  { id: 'DATASET', label: 'DATASET', subtitle: 'Reference Files' },
  { id: 'CASE_1', label: 'CASE 01', subtitle: 'Data Fundamentals', num: '01', caseNumber: 1 },
  { id: 'CASE_2', label: 'CASE 02', subtitle: 'Data Integrity', num: '02', caseNumber: 2 },
  { id: 'CASE_3', label: 'CASE 03', subtitle: 'Analytical Intelligence', num: '03', caseNumber: 3 },
];

const CASE_DESCRIPTIONS: Record<number, string> = {
  1: 'Basic data operations, list aggregation, and dictionary lookup.',
  2: 'Submission integrity checks and set-based duplicate detection.',
  3: 'Leaderboard analysis and multi-field tuple ranking.',
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────────────────────────────────
export const EventAnalyticsArenaPage: React.FC = () => {
  const { user } = useAuth();
  const teamUser = user?.type === 'TEAM' ? (user as any) : null;
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [arenaState, setArenaState] = useState<AnalyticsArenaStateDto | null>(null);
  const [activeNav, setActiveNav] = useState<NavTab>('CASE_1');
  const [selectedOptions, setSelectedOptions] = useState<Record<string, 'A' | 'B' | 'C' | 'D'>>({});
  const [flaggedQuestions, setFlaggedQuestions] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('ignitron_r3_flagged') || '{}'); } catch { return {}; }
  });
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [submittingCaseNum, setSubmittingCaseNum] = useState<number | null>(null);
  const [caseBanner, setCaseBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showFinalModal, setShowFinalModal] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [showLeaveWarningModal, setShowLeaveWarningModal] = useState(false);
  const [showConcludedModal, setShowConcludedModal] = useState(false);

  // Dataset explorer
  const [selectedDatasetFile, setSelectedDatasetFile] = useState<string>('IGNITRON_Round3_Reference_Dataset.json');
  const [datasetSearch, setDatasetSearch] = useState('');
  const [datasetPage, setDatasetPage] = useState(1);
  const [backendDatasetData, setBackendDatasetData] = useState<{
    columns: string[]; rows: Record<string, any>[]; totalRows: number; totalPages: number;
  } | null>(null);
  const [isDatasetLoading, setIsDatasetLoading] = useState(false);
  const [datasetSubTab, setDatasetSubTab] = useState<'PREVIEW' | 'SCHEMA'>('PREVIEW');

  // Competition / timer
  const { data: compState } = useCompetitionState();
  const isCompetitionPaused = Boolean(compState?.isPaused || arenaState?.isPaused);
  const isRoundActive = compState?.currentRoundNumber === 3 && compState?.status === 'ROUND_3_ACTIVE';
  const configuredDuration = compState?.rounds?.find((r) => r.roundNumber === 3)?.durationMinutes ?? 60;
  const timer = useServerTimer(
    isRoundActive ? compState?.deadlineAt : null,
    isCompetitionPaused,
    isRoundActive ? (arenaState?.remainingSeconds ?? compState?.remainingDurationSeconds ?? configuredDuration * 60) : configuredDuration * 60,
  );
  const isConcluded = Boolean(
    compState?.status &&
      (['ROUND_3_EVALUATION', 'FINAL_EVALUATION', 'COMPLETED'].includes(compState.status) ||
        (compState.currentRoundNumber && compState.currentRoundNumber > 3)),
  ) || Boolean(timer.isExpired && compState?.deadlineAt);
  const isLocked = isConcluded || Boolean(arenaState?.isSubmitted);

  const { focusWarning, isLockedByProctoring, lockStatus, isDisqualified, lockReason, warningCount, clearWarning, refreshStatus } =
    useParticipantMonitoring({
      roundNumber: 3,
      isRoundActive: Boolean(isRoundActive && !isLocked),
      isSubmitted: Boolean(arenaState?.isSubmitted),
      isConcluded,
      isReady: !isLoading && Boolean(arenaState),
      arenaType: 'ANALYTICS',
    });

  useEffect(() => { if (timer.isExpired && !arenaState?.isSubmitted) setShowConcludedModal(true); }, [timer.isExpired, arenaState?.isSubmitted]);

  // Fetch arena state
  const fetchArenaState = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const state = await questionAndArenaService.getAnalyticsArenaState();
      setArenaState(state);
      const initialOpts: Record<string, 'A' | 'B' | 'C' | 'D'> = {};
      for (const c of state.cases) {
        for (const q of c.questions) {
          if (q.selectedOption && ['A', 'B', 'C', 'D'].includes(q.selectedOption)) {
            initialOpts[q.id] = q.selectedOption as 'A' | 'B' | 'C' | 'D';
          }
        }
      }
      setSelectedOptions(initialOpts);
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.message || err?.message || 'Failed to load Round 3.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchArenaState(); }, [fetchArenaState]);

  // Dataset preview
  useEffect(() => {
    if (activeNav !== 'DATASET') return;
    const def = DATASET_REGISTRY[selectedDatasetFile];
    if (!def) return;
    setIsDatasetLoading(true);
    setBackendDatasetData(null);
    questionAndArenaService.getDatasetPreview(selectedDatasetFile, datasetPage, 10, datasetSearch)
      .then((data: any) => { setBackendDatasetData(data); })
      .catch(() => {})
      .finally(() => setIsDatasetLoading(false));
  }, [activeNav, selectedDatasetFile, datasetPage, datasetSearch]);

  useEffect(() => { setDatasetPage(1); }, [selectedDatasetFile, datasetSearch]);

  // Computed
  const activeCase = useMemo(() => {
    if (!arenaState || activeNav === 'DATASET') return null;
    const caseNum = NAV_TABS.find((t) => t.id === activeNav)?.caseNumber;
    return arenaState.cases.find((c) => c.caseNumber === caseNum) ?? null;
  }, [arenaState, activeNav]);

  const totalQuestionsCount = useMemo(
    () => arenaState?.cases.reduce((acc, c) => acc + c.questions.length, 0) ?? 6,
    [arenaState],
  );

  const answeredCount = useMemo(() => {
    if (!arenaState) return 0;
    return arenaState.cases
      .flatMap((c) => c.questions)
      .filter((q) => Boolean(selectedOptions[q.id])).length;
  }, [arenaState, selectedOptions]);

  // Case progress
  const caseProgress = useMemo(() => {
    if (!arenaState) {
      return {
        1: { answered: 0, total: 2, submitted: false },
        2: { answered: 0, total: 2, submitted: false },
        3: { answered: 0, total: 2, submitted: false },
      };
    }
    const result: Record<number, { answered: number; total: number; submitted: boolean }> = {};
    for (const c of arenaState.cases) {
      result[c.caseNumber] = {
        answered: c.questions.filter((q) => Boolean(selectedOptions[q.id])).length,
        total: c.questions.length,
        submitted: c.questions.length > 0 && c.questions.every((q) => q.isSubmitted),
      };
    }
    return result;
  }, [arenaState, selectedOptions]);

  // Handlers
  const handleSelectNav = useCallback((tabId: NavTab) => {
    setActiveNav(tabId);
    setCaseBanner(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleSelectOption = useCallback(async (q: AnalyticsQuestionDto, optKey: 'A' | 'B' | 'C' | 'D') => {
    if (q.isSubmitted || isLocked || isCompetitionPaused || isLockedByProctoring) return;
    setSelectedOptions((prev) => ({ ...prev, [q.id]: optKey }));
    setSavingQuestionId(q.id);
    setSavedToast(null);
    try {
      await questionAndArenaService.selectAnalyticsOption(q.id, optKey);
      setSavedToast(`Q${q.orderNumber} saved`);
      setTimeout(() => setSavedToast(null), 2200);
    } catch {}
    finally { setSavingQuestionId(null); }
  }, [isLocked, isCompetitionPaused, isLockedByProctoring]);

  const handleSubmitCase = useCallback(async () => {
    if (!activeCase) return;
    setSubmittingCaseNum(activeCase.caseNumber);
    setCaseBanner(null);
    try {
      await questionAndArenaService.submitAnalyticsCase(
        activeCase.caseNumber as 1 | 2 | 3,
        activeCase.questions.map((q) => ({
          questionId: q.id,
          selectedOption: (selectedOptions[q.id] || 'A') as 'A' | 'B' | 'C' | 'D',
        })),
      );
      setCaseBanner({ type: 'success', message: `Case 0${activeCase.caseNumber} submitted and locked successfully.` });
      await fetchArenaState();
    } catch (err: any) {
      setCaseBanner({ type: 'error', message: err?.response?.data?.message || 'Failed to submit case.' });
    } finally {
      setSubmittingCaseNum(null);
    }
  }, [activeCase, selectedOptions, fetchArenaState]);

  const handleFinalSubmit = useCallback(async () => {
    setIsFinalizing(true);
    try {
      await questionAndArenaService.finalizeRound3();
      setShowFinalModal(false);
      await fetchArenaState();
    } catch (err: any) {
      setCaseBanner({ type: 'error', message: err?.response?.data?.message || 'Failed to finalize round.' });
      setShowFinalModal(false);
    } finally { setIsFinalizing(false); }
  }, [fetchArenaState]);

  const toggleFlagQuestion = (questionId: string) => {
    setFlaggedQuestions((prev) => {
      const next = { ...prev, [questionId]: !prev[questionId] };
      try { localStorage.setItem('ignitron_r3_flagged', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const handleBackToDashboard = () => {
    if (!isLocked && !isConcluded && !timer.isExpired && isRoundActive) {
      setShowLeaveWarningModal(true);
    } else {
      navigate('/team/dashboard');
    }
  };

  // Computed case readiness
  const isActiveCaseSubmitted = activeCase ? activeCase.questions.length > 0 && activeCase.questions.every((q) => q.isSubmitted) : false;
  const isActiveCaseReadyToSubmit = activeCase
    ? activeCase.questions.length > 0 &&
      activeCase.questions.every((q) => Boolean(selectedOptions[q.id])) &&
      !isActiveCaseSubmitted &&
      !isLocked &&
      !isCompetitionPaused &&
      !isLockedByProctoring
    : false;

  const allCasesSubmitted = [1, 2, 3].every((cn) => caseProgress[cn]?.submitted);

  // ─────────────────────── RENDER STATES ───────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#020b06] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative mx-auto w-14 h-14">
            <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20" />
            <div className="absolute inset-0 rounded-full border-t-2 border-emerald-400 animate-spin" />
            <Code2 className="absolute inset-0 m-auto w-6 h-6 text-emerald-400" />
          </div>
          <p className="text-xs font-mono tracking-wide text-emerald-300/70">Loading Python Code Tracing Challenge…</p>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="min-h-screen bg-[#020b06] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-rose-950/60 border border-rose-500/40 p-6 text-center space-y-4">
          <AlertTriangle className="mx-auto w-10 h-10 text-rose-400" />
          <p className="text-sm text-rose-200">{errorMessage}</p>
          <button onClick={fetchArenaState} className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-sm cursor-pointer">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────── MAIN RENDER ───────────────────────
  const datasetFiles = Object.keys(DATASET_REGISTRY);
  const selectedDef = DATASET_REGISTRY[selectedDatasetFile];
  const displayRows = backendDatasetData?.rows ?? selectedDef?.previewRows ?? [];
  const displayColumns = backendDatasetData?.columns ?? selectedDef?.columns ?? [];
  const progressPct = totalQuestionsCount > 0 ? (answeredCount / totalQuestionsCount) * 100 : 0;

  return (
    <div
      className="min-h-screen bg-[#020b06] text-slate-100 flex flex-col selection:bg-emerald-500/30"
      style={{
        fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
        backgroundImage:
          'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(16, 185, 129, 0.08), transparent 70%)',
      }}
    >
      <ExamLockOverlay
        isOpen={Boolean(isLockedByProctoring)}
        lockStatus={lockStatus}
        isDisqualified={isDisqualified}
        lockReason={lockReason}
        warningCount={warningCount}
        onRefreshStatus={refreshStatus}
        onReturnToDashboard={() => navigate('/team/dashboard')}
      />

      {/* ═══════════════════════════ TOP HEADER ═══════════════════════════ */}
      <header className="sticky top-0 z-40 bg-[#020d07]/95 backdrop-blur-xl border-b border-emerald-900/50">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleBackToDashboard}
              title="Back to Dashboard"
              className="p-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/50 text-emerald-300 transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                <Flame className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <div className="text-xs font-black tracking-widest text-emerald-400 uppercase leading-none">IGNITRON 2K26</div>
                <div className="text-[10px] text-slate-500 font-mono leading-none mt-0.5">CODE RELAY ARENA</div>
              </div>
            </div>
          </div>

          {/* Round indicators */}
          <div className="hidden md:flex items-center gap-2">
            {['Round 1', 'Round 2'].map((r) => (
              <span
                key={r}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/70 border border-slate-800 text-slate-400 text-xs font-medium cursor-default"
              >
                {r} <Check className="w-3 h-3 text-emerald-400" />
              </span>
            ))}
            <span className="flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/50 text-emerald-200 text-xs font-bold shadow-[0_0_14px_rgba(16,185,129,0.18)]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Round 3
            </span>
          </div>

          {/* Right: Team + Server-Authoritative Timer */}
          <div className="flex items-center gap-2.5 shrink-0">
            {teamUser && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/70 border border-slate-800 text-xs text-slate-300 font-semibold">
                <CircleDot className="w-3 h-3 text-emerald-400" />
                <span>{teamUser.teamName || 'Team'}</span>
              </div>
            )}
            <div
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-xs font-mono font-bold ${
                timer.secondsLeft > 0 && timer.secondsLeft <= 300
                  ? 'bg-rose-950/70 border-rose-500/50 text-rose-300 animate-pulse'
                  : 'bg-[#04180d] border-emerald-700/50 text-emerald-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] uppercase tracking-wider text-slate-400">Time Left</span>
              <span className="text-sm font-black tracking-tight text-white">{timer.formatted}</span>
            </div>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════ ROUND BANNER ═══════════════════════════ */}
      <div className="bg-gradient-to-r from-[#020f08] via-[#041a0d] to-[#020f08] border-b border-emerald-900/40">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-900/70 to-teal-950/80 border border-emerald-500/30 flex items-center justify-center shadow-[0_0_16px_rgba(16,185,129,0.12)] shrink-0">
              <Code2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-amber-400">ROUND 03</span>
                <span className="text-slate-700">•</span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400/70">No Negative Marking</span>
              </div>
              <h1 className="text-lg sm:text-xl font-black text-white tracking-tight">
                Python Code <span className="text-emerald-400">Tracing Challenge</span>
              </h1>
              <p className="text-xs text-slate-400">
                Read each Python snippet carefully and select the option where both the code and its output are correct.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {[
              { label: 'Questions', value: String(totalQuestionsCount), accent: 'text-white' },
              { label: 'Per Question', value: '1 Mark', accent: 'text-emerald-300' },
              { label: 'Total Score', value: '6 Marks', accent: 'text-amber-300' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="px-3.5 py-2 rounded-xl bg-[#03150b]/90 border border-emerald-900/60 text-center min-w-[82px]"
              >
                <div className={`text-sm font-black ${stat.accent}`}>{stat.value}</div>
                <div className="text-[10px] font-mono text-slate-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════ NAVIGATION BAR ═══════════════════════════ */}
      <nav className="bg-[#020d07]/90 border-b border-emerald-900/40 sticky top-14 z-30 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6">
          <div className="flex items-stretch gap-1 overflow-x-auto">
            {NAV_TABS.map((tab) => {
              const isActive = activeNav === tab.id;
              const cp = tab.caseNumber ? caseProgress[tab.caseNumber] : null;
              const submitted = cp?.submitted;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleSelectNav(tab.id)}
                  className={`flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-all shrink-0 cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'border-emerald-400 text-emerald-200 bg-emerald-500/10'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                  }`}
                >
                  {tab.id === 'DATASET' ? (
                    <Database className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <span
                      className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black border ${
                        isActive
                          ? 'bg-emerald-400 text-slate-950 border-emerald-300'
                          : submitted
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-slate-900 text-slate-400 border-slate-700'
                      }`}
                    >
                      {submitted ? <Check className="w-3 h-3" /> : tab.num}
                    </span>
                  )}
                  <span className="tracking-wide">{tab.label}</span>
                  <span className={`hidden lg:inline text-[11px] font-normal ${isActive ? 'text-emerald-300/75' : 'text-slate-500'}`}>
                    — {tab.subtitle}
                  </span>
                  {cp && !submitted && (
                    <span className="ml-1 px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-800/60 text-emerald-300 text-[10px] font-mono">
                      {cp.answered}/{cp.total}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* ═══════════════════════════ ALERTS / BANNERS ═══════════════════════════ */}
      {(focusWarning || isCompetitionPaused || arenaState?.isSubmitted || caseBanner) && (
        <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 pt-3 space-y-2">
          {focusWarning && (
            <div className="p-3 rounded-xl bg-amber-950/70 border border-amber-500/50 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-amber-200">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{focusWarning.message}</span>
              </div>
              <button
                type="button"
                onClick={clearWarning}
                className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-200 font-mono text-[11px] cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}
          {isCompetitionPaused && (
            <div className="p-3 rounded-xl bg-amber-950/60 border border-amber-500/40 flex items-center gap-2.5 text-xs text-amber-200">
              <PauseCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Round 3 is currently paused by administrators. Inputs are temporarily locked.</span>
            </div>
          )}
          {arenaState?.isSubmitted && (
            <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/40 flex items-center gap-2.5 text-xs text-emerald-200">
              <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Round 3 has been officially finalized and submitted. Your answers are locked and preserved.</span>
            </div>
          )}
          {caseBanner && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                caseBanner.type === 'success'
                  ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
                  : 'bg-rose-950/80 border-rose-500/50 text-rose-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {caseBanner.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{caseBanner.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setCaseBanner(null)}
                className="text-[11px] font-mono opacity-75 hover:opacity-100 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════ MAIN WORKSPACE ═══════════════════════════ */}
      <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5 flex flex-col lg:flex-row gap-5 flex-1">

        {/* ─────── LEFT SIDEBAR ─────── */}
        <aside className="w-full lg:w-64 shrink-0 space-y-4">
          {/* Round Progress */}
          <div className="rounded-2xl bg-[#03130a]/90 border border-emerald-900/50 p-4 space-y-3.5 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-emerald-400/80 flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5" /> Progress
              </span>
              <span className="text-xs font-mono font-bold text-white">
                {answeredCount}/{totalQuestionsCount}
              </span>
            </div>

            {/* Clean linear + circular summary */}
            <div className="flex items-center gap-3.5 py-1">
              <div className="relative w-16 h-16 shrink-0">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(16,185,129,0.12)" strokeWidth="6" />
                  <circle
                    cx="32"
                    cy="32"
                    r="26"
                    fill="none"
                    stroke="url(#r3ProgGrad)"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={`${(progressPct / 100) * 163.36} 163.36`}
                    style={{ transition: 'stroke-dasharray 0.4s ease' }}
                  />
                  <defs>
                    <linearGradient id="r3ProgGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#34d399" />
                      <stop offset="100%" stopColor="#10b981" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-xs font-black text-white">
                  {Math.round(progressPct)}%
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-200">{answeredCount} of {totalQuestionsCount} Answered</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {[1, 2, 3].filter((cn) => caseProgress[cn]?.submitted).length} of 3 cases submitted
                </div>
              </div>
            </div>

            {/* Case completion list */}
            <div className="space-y-1.5 pt-1 border-t border-emerald-900/40">
              {[
                { num: 1, title: 'Data Fundamentals' },
                { num: 2, title: 'Data Integrity' },
                { num: 3, title: 'Analytical Intelligence' },
              ].map((c) => {
                const cp = caseProgress[c.num] ?? { answered: 0, total: 2, submitted: false };
                const isSelectedTab = activeNav === `CASE_${c.num}`;
                return (
                  <button
                    key={c.num}
                    type="button"
                    onClick={() => handleSelectNav(`CASE_${c.num}` as NavTab)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition cursor-pointer border text-left ${
                      isSelectedTab
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-100'
                        : 'bg-transparent border-transparent hover:bg-emerald-950/40 text-slate-300'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 text-[10px] font-bold ${
                        cp.submitted
                          ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                          : cp.answered === cp.total
                          ? 'border-emerald-500/60 text-emerald-300'
                          : 'border-slate-700 text-slate-500'
                      }`}
                    >
                      {cp.submitted ? <Check className="w-3 h-3" /> : c.num}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate">Case 0{c.num}</div>
                      <div className="text-[10px] text-slate-500 truncate">{c.title}</div>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">
                      {cp.answered}/{cp.total}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Instructions */}
          <div className="rounded-2xl bg-[#03130a]/90 border border-emerald-900/50 p-4 space-y-3 shadow-lg">
            <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-emerald-400/80 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" /> Instructions
            </div>
            <ul className="space-y-2">
              {[
                'Trace each Python snippet and verify its output.',
                'Select the single option where both code and output match.',
                'Answers auto-save immediately on selection.',
                'Submit each case once both questions are answered.',
                'No code execution or Judge0 run is required.',
              ].map((text, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-300 leading-relaxed">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
            <div className="pt-2.5 border-t border-emerald-900/40 flex items-center justify-between text-xs font-bold">
              <span className="text-slate-400">Maximum Score</span>
              <span className="text-amber-300 flex items-center gap-1 font-mono">
                <Trophy className="w-3.5 h-3.5" /> 6 Marks
              </span>
            </div>
          </div>
        </aside>

        {/* ─────── MAIN PANEL ─────── */}
        <main key={activeNav} className="flex-1 min-w-0 space-y-4 animate-[fadeIn_180ms_ease-out]">

          {/* ═══ DATASET EXPLORER VIEW ═══ */}
          {activeNav === 'DATASET' && (
            <section className="space-y-4">
              <div className="rounded-2xl bg-[#03130a]/90 border border-emerald-900/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                    <Database className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">Reference Dataset Explorer</h2>
                    <p className="text-xs text-slate-400">Browse and search the official Round 3 CSV and JSON reference files</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {(['PREVIEW', 'SCHEMA'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setDatasetSubTab(t)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold border transition cursor-pointer ${
                        datasetSubTab === t
                          ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
                          : 'bg-slate-900 text-slate-400 border-slate-700 hover:border-emerald-700/50'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col lg:flex-row gap-4">
                <div className="lg:w-60 shrink-0 rounded-2xl bg-[#03130a]/90 border border-emerald-900/50 p-3 space-y-1">
                  {datasetFiles.map((f) => {
                    const def = DATASET_REGISTRY[f];
                    const isJson = f.endsWith('.json');
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setSelectedDatasetFile(f)}
                        className={`w-full flex items-center gap-2 p-2.5 rounded-xl text-left transition cursor-pointer border ${
                          selectedDatasetFile === f
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
                            : 'border-transparent hover:bg-emerald-950/40 text-slate-300'
                        }`}
                      >
                        <FileSpreadsheet className={`w-3.5 h-3.5 shrink-0 ${isJson ? 'text-amber-400' : 'text-emerald-400'}`} />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate">{f}</div>
                          <div className="text-[10px] text-slate-500 font-mono truncate">{def?.dfName}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex-1 min-w-0 rounded-2xl bg-[#03130a]/90 border border-emerald-900/50 p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-white">{selectedDef?.title}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">{selectedDef?.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                        <input
                          type="text"
                          placeholder="Search…"
                          value={datasetSearch}
                          onChange={(e) => setDatasetSearch(e.target.value)}
                          className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none w-40"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const url = questionAndArenaService.getDatasetDownloadUrl(selectedDatasetFile);
                          window.open(url, '_blank');
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-xs hover:border-emerald-700/50 transition cursor-pointer"
                      >
                        <Download className="w-3 h-3" /> Download
                      </button>
                    </div>
                  </div>

                  {datasetSubTab === 'PREVIEW' ? (
                    <div className="overflow-x-auto rounded-xl border border-emerald-900/40">
                      {isDatasetLoading ? (
                        <div className="p-8 text-center">
                          <Loader2 className="mx-auto w-5 h-5 text-emerald-400 animate-spin" />
                        </div>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-emerald-950/60">
                              {displayColumns.map((col) => (
                                <th
                                  key={col}
                                  className="px-3 py-2 text-left font-mono font-bold text-emerald-400/80 uppercase tracking-wide border-b border-emerald-900/40 whitespace-nowrap"
                                >
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {displayRows.map((row, ri) => (
                              <tr key={ri} className="border-b border-emerald-950/40 hover:bg-emerald-950/20 transition">
                                {displayColumns.map((col) => (
                                  <td key={col} className="px-3 py-2 font-mono text-slate-300 whitespace-nowrap">
                                    {String(row[col] ?? '')}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-emerald-900/40">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-emerald-950/60">
                            {['Field', 'Type', 'Description'].map((h) => (
                              <th
                                key={h}
                                className="px-3 py-2 text-left font-mono font-bold text-emerald-400/80 uppercase tracking-wide border-b border-emerald-900/40"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {selectedDef?.fieldInfo.map((fi, ri) => (
                            <tr key={ri} className="border-b border-emerald-950/40 hover:bg-emerald-950/20 transition">
                              <td className="px-3 py-2 font-mono text-emerald-300 whitespace-nowrap">{fi.field}</td>
                              <td className="px-3 py-2 font-mono text-amber-300/80 whitespace-nowrap">{fi.type}</td>
                              <td className="px-3 py-2 text-slate-300">{fi.desc}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {backendDatasetData && backendDatasetData.totalPages > 1 && (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-slate-500 font-mono">{backendDatasetData.totalRows} rows total</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={datasetPage <= 1}
                          onClick={() => setDatasetPage((p) => p - 1)}
                          className="p-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 disabled:opacity-40 hover:border-emerald-700/50 cursor-pointer disabled:cursor-not-allowed transition"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs font-mono text-slate-300">
                          {datasetPage} / {backendDatasetData.totalPages}
                        </span>
                        <button
                          type="button"
                          disabled={datasetPage >= backendDatasetData.totalPages}
                          onClick={() => setDatasetPage((p) => p + 1)}
                          className="p-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 disabled:opacity-40 hover:border-emerald-700/50 cursor-pointer disabled:cursor-not-allowed transition"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* ═══ CASE VIEW (EXACTLY 2 QUESTIONS PER CASE) ═══ */}
          {activeNav !== 'DATASET' && activeCase && (
            <section className="space-y-4">
              {/* Case Header */}
              <div className="rounded-2xl bg-[#03130a]/90 border border-emerald-900/50 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                    <BookOpen className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white tracking-tight">
                      {activeCase.caseTitle || `Case 0${activeCase.caseNumber}`}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {activeCase.caseDescription || CASE_DESCRIPTIONS[activeCase.caseNumber]}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {savedToast && (
                    <span className="text-[11px] font-mono text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 rounded-lg">
                      {savedToast}
                    </span>
                  )}
                  <span className="px-3 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-800/50 text-emerald-300 text-xs font-semibold">
                    {activeCase.questions.length} Questions
                  </span>
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold">
                    <Trophy className="w-3.5 h-3.5" /> {activeCase.totalMarks ?? 2} Marks
                  </span>
                  {isActiveCaseSubmitted && (
                    <span className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 text-xs font-bold">
                      <Lock className="w-3 h-3" /> Submitted
                    </span>
                  )}
                </div>
              </div>

              {/* Exactly 2 Question Cards */}
              <div className="space-y-4">
                {activeCase.questions.map((q) => {
                  const chosen = selectedOptions[q.id] || null;
                  const options = q.options && q.options.length > 0
                    ? q.options
                    : [
                        { key: 'A' as const, label: 'Option A', code: '' },
                        { key: 'B' as const, label: 'Option B', code: '' },
                        { key: 'C' as const, label: 'Option C', code: '' },
                        { key: 'D' as const, label: 'Option D', code: '' },
                      ];
                  const hasFixture = Array.isArray(q.fixtureTable) && q.fixtureTable.length > 0;
                  const fixtureCols = hasFixture ? Object.keys(q.fixtureTable![0]) : [];

                  return (
                    <article
                      key={q.id}
                      id={`r3-q-${q.orderNumber}`}
                      className="rounded-2xl bg-[#03130a]/95 border border-emerald-900/55 overflow-hidden shadow-xl"
                    >
                      {/* Question Header */}
                      <div className="px-5 py-3.5 bg-[#04180d]/70 border-b border-emerald-900/40 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 font-mono font-black text-xs">
                            Q{q.orderNumber}
                          </span>
                          <h3 className="text-sm sm:text-[15px] font-bold text-white">{q.title}</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleFlagQuestion(q.id)}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-mono transition cursor-pointer ${
                              flaggedQuestions[q.id]
                                ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                                : 'bg-slate-900/80 border-slate-700/80 text-slate-400 hover:text-amber-300'
                            }`}
                          >
                            <Flag className={`w-3 h-3 ${flaggedQuestions[q.id] ? 'fill-amber-400' : ''}`} />
                            <span>{flaggedQuestions[q.id] ? 'Flagged' : 'Flag'}</span>
                          </button>
                          <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-xs font-bold">
                            {q.marks ?? 1} Mark
                          </span>
                          {q.isSubmitted ? (
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 font-mono text-[11px] font-bold flex items-center gap-1">
                              <Lock className="w-3 h-3" /> Submitted
                            </span>
                          ) : savingQuestionId === q.id ? (
                            <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 font-mono text-[11px] flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" /> Saving…
                            </span>
                          ) : chosen ? (
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-950 border border-emerald-700/60 text-emerald-300 font-mono text-[11px]">
                              Saved ({chosen})
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-400 font-mono text-[11px]">
                              Unanswered
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Problem Statement + Neat Data Reference Panel */}
                      <div className="px-5 py-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start border-b border-emerald-950/60">
                        <div className={hasFixture ? 'lg:col-span-6' : 'lg:col-span-12'}>
                          <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                            {q.description || ''}
                          </p>
                        </div>

                        {hasFixture && (
                          <div className="lg:col-span-6 rounded-xl bg-[#020b06] border border-emerald-900/50 overflow-hidden">
                            <div className="px-3 py-1.5 bg-emerald-950/50 border-b border-emerald-900/40 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-emerald-300/80">
                              <Table2 className="w-3 h-3 text-amber-400" />
                              <span>{q.fixtureDescription || 'Reference Data'}</span>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-emerald-900/30">
                                    {fixtureCols.map((col) => (
                                      <th
                                        key={col}
                                        className="px-3 py-1.5 text-left font-mono text-[10px] font-bold uppercase text-slate-400 whitespace-nowrap"
                                      >
                                        {col}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {q.fixtureTable!.map((row, ri) => (
                                    <tr key={ri} className="border-b border-emerald-950/40 last:border-b-0">
                                      {fixtureCols.map((col) => (
                                        <td key={col} className="px-3 py-1.5 font-mono text-xs text-slate-200 whitespace-nowrap">
                                          {String(row[col] ?? '')}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 2×2 Balanced Option Grid */}
                      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3.5 items-stretch">
                        {options.map((opt) => {
                          const isSelected = chosen === opt.key;
                          const disabled = q.isSubmitted || isLocked || isCompetitionPaused || isLockedByProctoring;
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              disabled={disabled}
                              onClick={() => handleSelectOption(q, opt.key)}
                              aria-pressed={isSelected}
                              className={`group text-left rounded-xl border p-3.5 transition-all flex flex-col gap-2.5 ${
                                disabled ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'
                              } ${
                                isSelected
                                  ? 'bg-emerald-500/[0.08] border-emerald-400 shadow-[0_0_22px_rgba(16,185,129,0.18)]'
                                  : 'bg-[#020c06] border-emerald-900/55 hover:border-emerald-500/45 hover:bg-emerald-950/25'
                              }`}
                            >
                              {/* Option Top Bar: Radio + Clear A/B/C/D Label */}
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2.5">
                                  {/* Radio Indicator */}
                                  <span
                                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition ${
                                      isSelected
                                        ? 'border-emerald-400 bg-emerald-500/20'
                                        : 'border-slate-600 group-hover:border-emerald-500/60'
                                    }`}
                                  >
                                    {isSelected && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
                                  </span>

                                  {/* Clear A/B/C/D Badge */}
                                  <span
                                    className={`px-2 py-0.5 rounded-md font-mono text-xs font-black border ${
                                      isSelected
                                        ? 'bg-emerald-400 text-slate-950 border-emerald-300'
                                        : 'bg-emerald-950/70 text-emerald-300 border-emerald-800/70'
                                    }`}
                                  >
                                    {opt.key}
                                  </span>
                                  <span className="text-xs font-semibold text-slate-300">
                                    Option {opt.key}
                                  </span>
                                </div>

                                {isSelected && (
                                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded">
                                    Selected
                                  </span>
                                )}
                              </div>

                              {/* Dedicated Syntax-Highlighted Python Code Block */}
                              <pre className="flex-1 font-mono text-[12px] text-slate-100 whitespace-pre-wrap break-words bg-[#010804] border border-emerald-950/80 rounded-lg p-3 overflow-x-auto">
                                {highlightPython(opt.code || opt.label || '')}
                              </pre>
                            </button>
                          );
                        })}
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* Clean Bottom Case Action Bar (non-overlapping, in-flow) */}
              <div className="rounded-2xl bg-[#03130a]/95 border border-emerald-500/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                      isActiveCaseSubmitted
                        ? 'bg-emerald-500/20 border-emerald-500/40'
                        : 'bg-slate-900 border-slate-700/70'
                    }`}
                  >
                    {isActiveCaseSubmitted ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Send className="w-4 h-4 text-emerald-300" />
                    )}
                  </div>
                  <div className="text-xs">
                    {isActiveCaseSubmitted ? (
                      <span className="text-emerald-300 font-semibold">
                        Case 0{activeCase.caseNumber} is submitted and locked.
                      </span>
                    ) : (
                      <>
                        <div className="font-semibold text-slate-200">
                          Case 0{activeCase.caseNumber} Progress:{' '}
                          <span className="font-mono text-emerald-300">
                            {activeCase.questions.filter((q) => Boolean(selectedOptions[q.id])).length} /{' '}
                            {activeCase.questions.length} Answered
                          </span>
                        </div>
                        <div className="text-slate-400 mt-0.5">
                          Select one option for both questions, then submit Case 0{activeCase.caseNumber}.
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  {activeCase.caseNumber < 3 && (
                    <button
                      type="button"
                      onClick={() => handleSelectNav(`CASE_${activeCase.caseNumber + 1}` as NavTab)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
                    >
                      <span>Next Case</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={!isActiveCaseReadyToSubmit || submittingCaseNum === activeCase.caseNumber}
                    onClick={handleSubmitCase}
                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:from-slate-800 disabled:to-slate-800 text-slate-950 disabled:text-slate-500 font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 disabled:shadow-none disabled:cursor-not-allowed transition cursor-pointer"
                  >
                    {submittingCaseNum === activeCase.caseNumber ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Submitting…</span>
                      </>
                    ) : isActiveCaseSubmitted ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Case 0{activeCase.caseNumber} Submitted</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Submit Case 0{activeCase.caseNumber}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Finalize Round 3 Card (appears once all 3 cases are submitted) */}
              {allCasesSubmitted && !arenaState?.isSubmitted && !isLocked && (
                <div className="rounded-2xl bg-gradient-to-r from-emerald-950/85 to-teal-950/85 border border-emerald-500/50 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-[0_0_28px_rgba(16,185,129,0.12)]">
                  <div>
                    <div className="text-sm font-bold text-emerald-200 flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-amber-400" /> All 3 Cases Submitted
                    </div>
                    <div className="text-xs text-slate-300 mt-0.5">
                      Finalize Round 3 to lock your submission and record your server-calculated score.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFinalModal(true)}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 transition cursor-pointer shrink-0"
                  >
                    <Trophy className="w-4 h-4" /> Finalize Round 3
                  </button>
                </div>
              )}
            </section>
          )}
        </main>
      </div>

      {/* ═══════════════════════════ MODALS ═══════════════════════════ */}
      {showFinalModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl bg-[#031409] border border-emerald-500/50 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Finalize Round 3?</h3>
                <p className="text-xs text-slate-400">This action cannot be undone.</p>
              </div>
            </div>
            <div className="rounded-xl bg-amber-950/40 border border-amber-500/30 p-3 text-xs text-amber-200 space-y-1">
              <p className="font-semibold">Confirmation</p>
              <p>Finalizing will permanently lock your Round 3 answers. Your score will be calculated on the server.</p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowFinalModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-sm font-semibold cursor-pointer hover:bg-slate-700 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={isFinalizing}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 text-sm font-black cursor-pointer disabled:opacity-50 hover:from-emerald-400 hover:to-teal-400 transition"
              >
                {isFinalizing ? <Loader2 className="inline w-4 h-4 animate-spin" /> : 'Confirm Finalize'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showLeaveWarningModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-sm w-full rounded-2xl bg-[#031409] border border-amber-500/40 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-white">Leave Round 3?</h3>
                <p className="text-xs text-slate-400">Your progress is auto-saved. You can return while the round is active.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowLeaveWarningModal(false)}
                className="flex-1 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Stay
              </button>
              <button
                type="button"
                onClick={() => navigate('/team/dashboard')}
                className="flex-1 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-black cursor-pointer"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {showConcludedModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-sm w-full rounded-2xl bg-[#031409] border border-emerald-500/40 p-5 space-y-4 shadow-2xl text-center">
            <Clock className="mx-auto w-10 h-10 text-emerald-400" />
            <h3 className="text-base font-bold text-white">Time&apos;s Up!</h3>
            <p className="text-xs text-slate-400">Round 3 has concluded. Your answers have been recorded.</p>
            <button
              type="button"
              onClick={() => {
                setShowConcludedModal(false);
                navigate('/team/dashboard');
              }}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-sm cursor-pointer"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
