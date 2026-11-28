import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, Link } from 'react-router-dom';
import { questionAndArenaService } from '../../services/question-and-arena.service';
import { useCompetitionState, useServerTimer } from '../../hooks/useCompetition';
import { useParticipantMonitoring } from '../../hooks/useParticipantMonitoring';
import { ExamLockOverlay } from '../../components/competition/ExamLockOverlay';
import { useAuth } from '../../context/AuthContext';
import {
  SanitizedQuestionDto,
  McqSubmissionResultDto,
} from '@ignitron/shared';
import {
  Clock,
  CheckCircle2,
  Flag,
  ChevronLeft,
  ChevronRight,
  Send,
  RefreshCw,
  Check,
  ShieldAlert,
  ArrowRight,
  ArrowLeft,
  Trophy,
  AlertCircle,
  Eye,
  PauseCircle,
  Lock,
  Flame,
  ChevronDown,
  LogOut,
  Info,
  User,
  AlertTriangle,
} from 'lucide-react';

export const McqArenaPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const teamUser = user?.type === 'TEAM' ? (user as any) : null;
  const { data: compState } = useCompetitionState();

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Arena State
  const [questions, setQuestions] = useState<SanitizedQuestionDto[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<
    Record<string, { selectedOption: number | null; isFlagged: boolean }>
  >({});
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [submissionResult, setSubmissionResult] = useState<McqSubmissionResultDto | null>(null);
  const [reviewMode, setReviewMode] = useState<boolean>(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState<boolean>(false);
  const [showLeaveWarningModal, setShowLeaveWarningModal] = useState<boolean>(false);
  const [showConcludedModal, setShowConcludedModal] = useState<boolean>(false);

  // Configured duration from server or default 30m
  const r1ConfiguredDuration =
    compState?.rounds?.find((r) => r.roundNumber === 1)?.durationMinutes ?? 30;
  const [initialRemainingSeconds, setInitialRemainingSeconds] = useState<number>(
    r1ConfiguredDuration * 60,
  );
  const [initialPaused, setInitialPaused] = useState<boolean>(false);

  // Autosave indicator
  const [savingStatus, setSavingStatus] = useState<'saved' | 'saving' | 'error'>('saved');

  // Submit Modal
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Active competition timer
  const isR1Active = compState?.status === 'ROUND_1_ACTIVE';
  const effectiveIsPaused = compState?.isPaused ?? initialPaused;
  const timer = useServerTimer(
    isR1Active ? compState?.deadlineAt : null,
    effectiveIsPaused,
    isR1Active
      ? compState?.remainingDurationSeconds ?? initialRemainingSeconds
      : r1ConfiguredDuration * 60,
  );

  const isConcluded =
    Boolean(
      compState?.status &&
        ([
          'ROUND_1_EVALUATION',
          'ROUND_2_ACTIVE',
          'ROUND_2_EVALUATION',
          'ROUND_3_ACTIVE',
          'ROUND_3_EVALUATION',
          'FINAL_EVALUATION',
          'COMPLETED',
        ].includes(compState.status) ||
          (compState.currentRoundNumber && compState.currentRoundNumber > 1)),
    ) || Boolean(timer.isExpired && compState?.deadlineAt);

  const isLocked = isConcluded || isSubmitted;

  // Requirement 6: Anti-Cheating & Participant Monitoring
  const {
    focusWarning,
    isLockedByProctoring,
    lockStatus,
    isDisqualified,
    lockReason,
    warningCount,
    clearWarning,
    refreshStatus,
  } = useParticipantMonitoring({
    roundNumber: 1,
    isRoundActive: Boolean(isR1Active && !isLocked && !isConcluded && !timer.isExpired),
    isSubmitted: Boolean(isSubmitted),
    arenaType: 'MCQ',
  });

  // Requirement 1 & 3: Automatic Round Conclusion & Workspace Locking when timer hits zero
  useEffect(() => {
    if (timer.isExpired && !isSubmitted && !reviewMode) {
      setShowConcludedModal(true);
    }
  }, [timer.isExpired, isSubmitted, reviewMode]);

  const handleBackToDashboard = () => {
    if (!isLocked && !isConcluded && !timer.isExpired && isR1Active) {
      setShowLeaveWarningModal(true);
    } else {
      navigate('/team/dashboard');
    }
  };

  // Fetch initial arena state
  const loadArenaState = async () => {
    setLoading(true);
    setError(null);
    try {
      const state = await questionAndArenaService.getMcqArenaState();
      setQuestions(state.questions);
      setAnswers(state.answers || {});
      setInitialRemainingSeconds(state.remainingSeconds);
      setInitialPaused(state.isPaused);
      setIsSubmitted(state.isSubmitted);

      if (state.isSubmitted) {
        try {
          const res = await questionAndArenaService.submitMcqRound();
          setSubmissionResult(res);
        } catch (_) {
          // If already submitted and breakdown is present
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to initialize MCQ Arena.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadArenaState();
  }, []);

  // Automatically refresh arena state when Round 1 becomes active
  useEffect(() => {
    if (isR1Active && !isSubmitted) {
      loadArenaState();
    }
  }, [isR1Active]);

  // Timer Expiration Auto-Submit
  useEffect(() => {
    if (timer.isExpired && !isSubmitted && !loading && questions.length > 0) {
      handleFinalSubmit(true);
    }
  }, [timer.isExpired, isSubmitted, loading, questions.length]);

  // Handle Option Selection
  const handleSelectOption = async (optionIndex: number) => {
    if (isSubmitted || isConcluded || isLocked || timer.isExpired || effectiveIsPaused || reviewMode) return;
    const currentQ = questions[currentIndex];
    if (!currentQ) return;

    const currentAnswer = answers[currentQ.id] || { selectedOption: null, isFlagged: false };
    const updated = {
      ...currentAnswer,
      selectedOption: optionIndex,
    };

    setAnswers((prev) => ({
      ...prev,
      [currentQ.id]: updated,
    }));

    setSavingStatus('saving');
    try {
      await questionAndArenaService.saveMcqAnswer({
        questionId: currentQ.id,
        selectedOption: optionIndex,
        isFlagged: updated.isFlagged,
      });
      setSavingStatus('saved');
    } catch (err) {
      setSavingStatus('error');
    }
  };

  // Handle Flag Toggle
  const handleToggleFlag = async () => {
    if (isSubmitted || isConcluded || isLocked || timer.isExpired || effectiveIsPaused || reviewMode) return;
    const currentQ = questions[currentIndex];
    if (!currentQ) return;

    const currentAnswer = answers[currentQ.id] || { selectedOption: null, isFlagged: false };
    const updated = {
      ...currentAnswer,
      isFlagged: !currentAnswer.isFlagged,
    };

    setAnswers((prev) => ({
      ...prev,
      [currentQ.id]: updated,
    }));

    setSavingStatus('saving');
    try {
      await questionAndArenaService.saveMcqAnswer({
        questionId: currentQ.id,
        selectedOption: updated.selectedOption,
        isFlagged: updated.isFlagged,
      });
      setSavingStatus('saved');
    } catch (err) {
      setSavingStatus('error');
    }
  };

  // Final Submission
  const handleFinalSubmit = async (autoSubmit = false) => {
    if (isSubmitted || submitting) return;
    setSubmitting(true);
    try {
      const res = await questionAndArenaService.submitMcqRound({ autoSubmit });
      setSubmissionResult(res);
      setIsSubmitted(true);
      setConfirmSubmitOpen(false);
    } catch (err: any) {
      if (err?.message && err.message.toLowerCase().includes('already been submitted')) {
        setIsSubmitted(true);
        setConfirmSubmitOpen(false);
        try {
          const res = await questionAndArenaService.submitMcqRound();
          setSubmissionResult(res);
        } catch (_) {}
      } else {
        setError(err?.message || 'Failed to submit answers.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  const currentQuestion = questions[currentIndex];
  const answeredCount = questions.filter((q) => {
    const sel = answers[q.id]?.selectedOption;
    return sel !== null && sel !== undefined;
  }).length;
  const flaggedCount = questions.filter((q) => Boolean(answers[q.id]?.isFlagged)).length;
  const unansweredCount = Math.max(0, questions.length - answeredCount);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020D0A] text-[#00F5A0] flex flex-col items-center justify-center p-4 font-mono">
        <RefreshCw className="w-10 h-10 animate-spin text-[#00F5A0] mb-4" />
        <h2 className="text-lg font-bold tracking-wider uppercase text-white">
          Preparing Round 1 MCQ Arena
        </h2>
        <p className="text-xs text-emerald-400/70 mt-1">
          Loading 15 screening challenges and initializing authoritative timer...
        </p>
      </div>
    );
  }

  // Pre-Round Waiting Screen / Ineligible Access Screen (Strict Security Guarding)
  if ((!isR1Active && !isSubmitted && !isConcluded) || (error && !isSubmitted && !isConcluded)) {
    const isLockedPreRound =
      !error ||
      error.toLowerCase().includes('will become available') ||
      error.toLowerCase().includes('countdown') ||
      error.toLowerCase().includes('not currently active');

    const isRoundConcluded =
      compState?.status === 'COMPLETED' ||
      (Boolean(compState?.currentRoundNumber) && (compState?.currentRoundNumber ?? 0) > 1);

    return (
      <div className="min-h-screen bg-[#020D0A] text-slate-100 flex items-center justify-center p-4 font-sans selection:bg-emerald-500/30">
        <div className="max-w-md w-full bg-[#031712] rounded-3xl border border-[#0D3E2E] shadow-2xl p-8 text-center space-y-5">
          <div
            className={`w-16 h-16 rounded-2xl ${
              isLockedPreRound
                ? 'bg-amber-500/15 border border-amber-500/40 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.25)]'
                : 'bg-rose-500/15 border border-rose-500/40 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.25)]'
            } flex items-center justify-center mx-auto`}
          >
            {isLockedPreRound ? <Lock className="w-8 h-8" /> : <ShieldAlert className="w-8 h-8" />}
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-extrabold text-white">
              {isRoundConcluded
                ? 'Round 1 Concluded'
                : isLockedPreRound
                ? 'Round 1 MCQ Arena Locked'
                : 'Arena Access Restricted'}
            </h1>
            <p className="text-xs text-slate-400 leading-relaxed font-mono">
              {isRoundConcluded
                ? 'Round 1 has concluded. Submissions and question access are now closed.'
                : error
                ? error
                : 'The competition arena will become available when Round 1 begins. Please wait for the tournament administrator to start the round.'}
            </p>
          </div>
          <button
            onClick={() => navigate('/team/dashboard')}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-[#00F5A0] hover:from-[#00F5A0] hover:to-[#34D399] text-black font-black font-mono text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(0,245,160,0.35)]"
          >
            <span>Return to Team Dashboard</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Submitted Completion Screen (Only shown when not reviewing)
  if (isSubmitted && submissionResult && !reviewMode) {
    return (
      <div className="min-h-screen bg-[#020D0A] text-slate-100 flex items-center justify-center p-4 font-sans selection:bg-emerald-500/30">
        <div className="max-w-md w-full bg-[#031712] rounded-3xl border border-[#0D3E2E] shadow-2xl p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-amber-500/15 rounded-3xl border border-amber-500/40 flex items-center justify-center mx-auto text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.25)]">
            <Trophy className="w-8 h-8" />
          </div>

          <div className="space-y-1.5">
            <h1 className="text-2xl font-black text-white">Round 1 Completed!</h1>
            <p className="text-xs text-slate-400 font-mono">
              Your team's multiple-choice answers have been submitted and automatically evaluated.
            </p>
          </div>

          {/* Prominent Post-Submission Waiting Notification */}
          <div className="p-4 bg-[#04241B] border border-[#00F5A0]/40 rounded-2xl text-left text-xs text-emerald-200 flex items-start gap-3 shadow-md">
            <CheckCircle2 className="w-5 h-5 text-[#00F5A0] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold block text-white font-mono">
                Submission Received Successfully!
              </span>
              <p className="text-[11px] text-emerald-300/80 leading-relaxed">
                Your answers have been recorded. The administrators will now evaluate the round and announce shortlisted teams on the dashboard.
              </p>
            </div>
          </div>

          {/* Score Card */}
          <div className="bg-[#010906] rounded-2xl border border-[#0D3E2E] p-6 space-y-3">
            <div className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
              Official Round 1 Status
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono text-[#00F5A0] shadow-[0_0_15px_rgba(0,245,160,0.3)]">
              {compState?.status === 'COMPLETED' ? (
                <>
                  {submissionResult.score.toFixed(1)}{' '}
                  <span className="text-lg font-bold text-emerald-600">/ 30</span>
                </>
              ) : (
                <span>Submission Recorded</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs pt-3 border-t border-[#0D3E2E]">
              <div className="p-2.5 rounded-xl bg-[#02130F] border border-[#0A261C]">
                <span className="text-slate-400 block text-[10px] font-mono">Attempted</span>
                <span className="font-bold text-white font-mono text-sm">
                  {submissionResult.answeredCount} / {submissionResult.totalQuestions}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#02130F] border border-[#0A261C]">
                <span className="text-slate-400 block text-[10px] font-mono">Evaluation</span>
                <span className="font-bold text-amber-400 font-mono text-xs uppercase">
                  {compState?.status === 'COMPLETED'
                    ? 'Completed'
                    : 'Under Review'}
                </span>
              </div>
            </div>
          </div>

          <div className="p-3.5 bg-blue-950/40 border border-blue-500/30 rounded-xl text-left text-xs text-blue-200 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed font-mono">
              <strong>Shortlisting Threshold:</strong> Top qualifying teams will advance to Round 2 (Bug Hunt Arena).
            </p>
          </div>

          <div className="space-y-2.5 pt-1">
            <button
              onClick={() => setReviewMode(true)}
              className="w-full py-2.5 rounded-xl bg-[#010906] hover:bg-[#04241B] text-slate-200 hover:text-white font-mono font-bold text-xs transition-colors flex items-center justify-center gap-2 border border-[#0D3E2E]"
            >
              <Eye className="w-4 h-4 text-[#00F5A0]" />
              <span>Review Submitted Answers</span>
            </button>

            <button
              onClick={() => navigate('/team/dashboard')}
              className="w-full py-3 rounded-xl bg-[#00F5A0] hover:bg-[#34D399] text-black font-black font-mono text-xs uppercase tracking-wider shadow-[0_0_15px_rgba(0,245,160,0.4)] transition-all flex items-center justify-center gap-2"
            >
              <span>Return to Team Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // MAIN COMPETITION DASHBOARD (MATCHING REFERENCE SCREENSHOT)
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen max-h-screen bg-[#020D0A] text-slate-100 flex flex-col overflow-hidden font-sans select-none relative">
      {/* Background ambient radial gradients & starry wave glow at bottom */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_80%_40%_at_50%_-10%,rgba(0,245,160,0.08),transparent_70%)]" />
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_60%_30%_at_50%_110%,rgba(0,245,160,0.05),transparent)]" />

      {/* Decorative Bottom-Left Wave Graphics matching reference */}
      <svg
        className="absolute bottom-0 left-0 w-[550px] h-[160px] pointer-events-none opacity-25 z-0"
        viewBox="0 0 600 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M-50 180 C 100 120, 250 190, 400 130 C 500 90, 580 150, 650 110"
          stroke="#00F5A0"
          strokeWidth="1.5"
          strokeDasharray="3 6"
        />
        <path
          d="M-50 195 C 120 140, 220 200, 380 145 C 480 110, 550 170, 650 130"
          stroke="#00F5A0"
          strokeWidth="1"
          strokeOpacity="0.6"
        />
      </svg>

      {/* ===================================================================== */}
      {/* 1. TOP NAVIGATION BAR (Bar 1: ~64px)                                  */}
      {/* ===================================================================== */}
      <div
        role="navigation"
        aria-label="Global Arena Navigation"
        className="h-16 px-6 bg-[#020F0B]/95 border-b border-[#0D382B] flex items-center justify-between shrink-0 z-30 backdrop-blur-md"
      >
        {/* Left: Flame Logo + IGNITRON 2K26 + CODING COLLAB */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/20 via-orange-500/20 to-red-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.25)]">
            <Flame className="w-5 h-5 text-amber-400 fill-amber-400/80 animate-pulse" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-extrabold text-white tracking-wider leading-none">
              IGNITRON 2K26
            </span>
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#00F5A0] font-bold leading-none mt-1">
              CODING COLLAB
            </span>
          </div>
        </div>

        {/* Center: 3 Round Navigation Pills */}
        <div className="flex items-center gap-3">
          {/* Round 1 (Active Glowing Pill) */}
          <div className="px-5 py-1.5 rounded-full bg-[#04241B] border-2 border-[#00F5A0] text-[#00F5A0] font-mono text-xs font-bold shadow-[0_0_15px_rgba(0,245,160,0.35)] flex items-center gap-2">
            <span>Round 1</span>
          </div>

          {/* Round 2 (Dark Inactive Pill) */}
          <Link
            to="/team/arena/bug-hunt"
            className="px-4 py-1.5 rounded-full bg-[#031812] border border-[#0F4A37] text-slate-400 hover:text-slate-200 font-mono text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <span>Round 2</span>
          </Link>

          {/* Round 3 (Locked Pill) */}
          <Link
            to="/team/arena/analytics"
            className="px-4 py-1.5 rounded-full bg-[#031812] border border-[#0F4A37] text-slate-400 hover:text-slate-200 font-mono text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <span>Round 3</span>
            <Lock className="w-3 h-3 text-slate-500" />
          </Link>
        </div>

        {/* Right: Team Dropdown, Dashboard Link, Workspace Link, Logout */}
        <div className="flex items-center gap-5">
          {/* Team Dropdown Pill */}
          <div className="px-3.5 py-1.5 rounded-xl bg-[#031913] border border-[#0E4735] flex items-center gap-2.5 shadow-inner">
            <div className="w-6 h-6 rounded-lg bg-[#00F5A0]/15 border border-[#00F5A0]/40 flex items-center justify-center text-[#00F5A0]">
              <User className="w-3.5 h-3.5" />
            </div>
            <div className="flex flex-col text-left font-mono leading-tight">
              <span className="text-xs font-bold text-white">
                Team: {teamUser?.teamName || 'Bankai'}
              </span>
              <span className="text-[10px] text-emerald-400/80">
                {teamUser?.teamCode || 'IGN-E031'}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-emerald-500 ml-1" />
          </div>

          {/* Direct Text Links */}
          <button
            type="button"
            onClick={handleBackToDashboard}
            className="text-xs font-mono font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            Dashboard
          </button>

          <Link
            to="/team/workspace"
            className="text-xs font-mono font-semibold text-slate-300 hover:text-white transition-colors"
          >
            Workspace
          </Link>

          {/* Logout Button */}
          <button
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            title="Log out"
            className="p-1.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 2. SECOND TOOLBAR (Top Arena Compact Toolbar: ~52px)                  */}
      {/* ===================================================================== */}
      {/* Top Arena Compact Toolbar */}
      {reviewMode ? (
        /* Read-Only Review Mode Toolbar */
        <div className="sticky top-0 z-20 h-14 px-6 bg-[#031712] border-b border-[#0D382B] flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setReviewMode(false)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#010906] hover:bg-[#04241B] text-white text-xs font-mono font-bold border border-[#0D3E2E] transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Score Card</span>
            </button>
            <span className="px-2.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-[11px] font-mono text-amber-300 font-bold uppercase">
              Read-Only Review Mode — Viewing submitted answers
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3.5 py-1 rounded-xl bg-[#04241B] border border-[#00F5A0]/40 text-[#00F5A0] font-mono text-xs font-bold shadow-sm">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {compState?.status === 'COMPLETED'
                  ? `Score: ${submissionResult?.score.toFixed(1)} / 30 pts`
                  : 'Evaluation in Progress'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#010906] border border-[#0A261C] text-slate-400 font-mono text-[11px]">
              <Eye className="w-3.5 h-3.5" />
              <span>Responses Locked</span>
            </div>
          </div>
        </div>
      ) : (
        /* Active Round Compact Toolbar (Round 1: MCQ Arena) */
        <div className="sticky top-0 z-20 h-14 px-6 bg-[#02130F]/95 border-b border-[#0D382B] flex items-center justify-between shrink-0 backdrop-blur-md">
          {/* Left: < Dashboard button + R1 badge + Round 1 – MCQ Arena */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBackToDashboard}
              className="px-3.5 py-1.5 rounded-xl border border-[#0D3E2E] bg-[#02130F] hover:bg-[#031C15] text-slate-300 hover:text-white text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
              <span>Dashboard</span>
            </button>

            <span className="px-2.5 py-0.5 rounded-lg bg-[#00F5A0]/20 border border-[#00F5A0]/50 text-[#00F5A0] font-mono font-black text-xs">
              R1
            </span>

            <h1 className="text-base font-bold text-white tracking-wide">
              Round 1 – MCQ Arena
            </h1>

            {/* Autosave feedback */}
            {!isSubmitted && (
              <div className="hidden lg:flex items-center gap-1.5 text-[11px] font-mono text-slate-400 ml-2 pl-2 border-l border-[#0D382B]">
                {savingStatus === 'saving' ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                    <span className="text-amber-400">Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3 h-3 text-[#00F5A0]" />
                    <span className="text-emerald-400/80">Answers synced</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Right: Time Remaining + Attempted + Submit Round 1 */}
          <div className="flex items-center gap-3.5">
            {/* Time Remaining Card */}
            <div className="px-3.5 py-1.5 rounded-xl border border-[#0D3E2E] bg-[#02130F] flex items-center gap-2 font-mono shadow-inner">
              <Clock className="w-4 h-4 text-[#E7B948]" />
              <span className="text-xs text-slate-300">Time Remaining:</span>
              <span className="text-sm font-black text-[#FFD45A] tracking-wider leading-none shadow-[0_0_8px_#FFD45A]">
                {timer.formatted.replace(':', ' : ')}
              </span>
            </div>

            {/* Attempted Counter */}
            <div className="px-3.5 py-1.5 rounded-xl border border-[#0D3E2E] bg-[#02130F] text-xs font-mono flex items-center gap-1.5 shadow-inner">
              <span className="text-slate-400">Attempted:</span>
              <strong className="text-[#00F5A0] font-bold">
                {answeredCount} / {questions.length}
              </strong>
            </div>

            {/* Submit Button */}
            <button
              onClick={() => setConfirmSubmitOpen(true)}
              disabled={isSubmitted || isLocked || isConcluded || timer.isExpired || effectiveIsPaused}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#00D98A] to-[#00F5A0] hover:from-[#00F5A0] hover:to-[#34D399] text-black font-mono font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-[0_0_15px_rgba(0,245,160,0.4)] transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5 text-black" />
              <span>Submit Round 1</span>
            </button>
          </div>
        </div>
      )}

      {/* Paused Banner */}
      {effectiveIsPaused && !isSubmitted && (
        <div className="bg-amber-500/20 border-b border-amber-500/40 text-amber-300 px-4 py-2 text-xs font-mono font-bold flex items-center justify-center gap-2 shadow-sm z-20">
          <PauseCircle className="w-4 h-4 animate-pulse text-amber-400" />
          <span>Tournament paused by Administrator. Timer and submissions are temporarily held.</span>
        </div>
      )}

      {/* Error alert if any */}
      {error && (
        <div className="mx-6 mt-3 p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-red-200 text-xs font-mono flex items-center gap-2 z-20">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 3. MAIN WORKSPACE (Left 5x3 Grid + Right Question Panel)              */}
      {/* ===================================================================== */}
      <main className="flex-1 flex gap-4 px-6 py-4 min-h-0 overflow-hidden z-10 max-w-[1600px] w-full mx-auto">
        {/* ------------------------------------------------------------------- */}
        {/* LEFT SIDEBAR: Question Navigator (5x3) + Scoring Rules (~300px)     */}
        {/* ------------------------------------------------------------------- */}
        <aside className="w-[300px] shrink-0 flex flex-col gap-3.5 overflow-y-auto pr-0.5 scrollbar-none">
          {/* Card 1: Question Navigator */}
          <div className="rounded-2xl border border-[#0D3E2E] bg-[#02130F]/90 p-4 backdrop-blur-md flex flex-col gap-3 shadow-lg shrink-0">
            <div className="flex items-center justify-between border-b border-[#0D382B] pb-2.5">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
                Question Navigator
              </span>
              <span className="text-xs font-mono text-slate-400">
                {answeredCount} / {questions.length} Answered
              </span>
            </div>

            {/* Exactly 15 Questions arranged in 5 columns x 3 rows */}
            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, idx) => {
                const ans = answers[q.id];
                const isAnswered = ans && ans.selectedOption !== null;
                const isFlagged = ans && ans.isFlagged;
                const isCurrent = idx === currentIndex;

                let stateClasses = 'bg-[#010906] border-[#0A261C] text-slate-400 hover:border-emerald-700/60';
                if (isCurrent) {
                  stateClasses = 'border-2 border-[#00F5A0] bg-[#04281E] text-white shadow-[0_0_12px_rgba(0,245,160,0.4)] ring-1 ring-[#00F5A0]';
                } else if (isAnswered && isFlagged) {
                  stateClasses = 'border-2 border-amber-400 bg-amber-950/70 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.25)]';
                } else if (isAnswered) {
                  stateClasses = 'border border-[#00F5A0]/60 bg-[#04241B] text-[#00F5A0] font-bold';
                } else if (isFlagged) {
                  stateClasses = 'border border-amber-400 bg-amber-950/60 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.25)]';
                }

                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIndex(idx)}
                    className={`h-10 rounded-xl font-mono text-xs font-bold border transition-all flex items-center justify-center relative cursor-pointer ${stateClasses}`}
                  >
                    <span>{idx + 1}</span>
                    {isFlagged && (
                      <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_4px_#f59e0b]" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Status Indicator Legend */}
            <div className="pt-2.5 border-t border-[#0D382B] flex items-center justify-between text-[11px] font-mono text-slate-300">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded-sm bg-[#00F5A0] shadow-[0_0_4px_#00F5A0]" />
                <span>Answered</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded-sm bg-[#F59E0B] shadow-[0_0_4px_#f59e0b]" />
                <span>Flagged</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded-sm bg-[#0A261C] border border-[#0D3E2E]" />
                <span className="text-slate-400">Unanswered</span>
              </div>
            </div>
          </div>

          {/* Card 2: Scoring Rules */}
          <div className="rounded-2xl border border-[#0D3E2E] bg-[#02130F]/90 p-4 backdrop-blur-md flex flex-col gap-2.5 shadow-lg shrink-0">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-[#00F5A0]" />
              <span className="text-xs font-mono font-bold text-slate-200">
                Scoring Rules
              </span>
            </div>

            <ul className="space-y-1.5 text-[11px] font-mono text-slate-300">
              <li className="flex items-start gap-1.5 leading-snug">
                <span className="text-[#00F5A0] shrink-0">•</span>
                <span>Exactly 15 questions × 2 marks each = 30 total marks.</span>
              </li>
              <li className="flex items-start gap-1.5 leading-snug">
                <span className="text-[#00F5A0] shrink-0">•</span>
                <span>No negative marking for incorrect choices.</span>
              </li>
              <li className="flex items-start gap-1.5 leading-snug">
                <span className="text-[#00F5A0] shrink-0">•</span>
                <span>Answers are automatically saved to the cloud on selection.</span>
              </li>
            </ul>
          </div>
        </aside>

        {/* ------------------------------------------------------------------- */}
        {/* RIGHT COLUMN: Main Active Question Card (flex-1)                    */}
        {/* ------------------------------------------------------------------- */}
        <section className="flex-1 flex flex-col min-w-0 overflow-y-auto pl-0.5 scrollbar-thin">
          {currentQuestion ? (
            <div className="rounded-2xl border border-[#0D3E2E] bg-[#02130F]/95 p-6 backdrop-blur-md flex flex-col justify-between shadow-2xl relative min-h-[500px] flex-1">
              <div>
                {/* Header Row: QUESTION X OF 15 + +2 Marks + Flag Question */}
                <div className="flex items-center justify-between pb-3 border-b border-[#0D382B]">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="px-3.5 py-1 rounded-full border border-[#00F5A0]/60 bg-[#00F5A0]/15 text-[#00F5A0] font-mono font-bold text-xs shadow-sm">
                      QUESTION {currentIndex + 1} OF {questions.length}
                    </span>
                    <span className="px-3 py-1 rounded-full border border-[#0D3E2E] bg-[#010906] text-slate-300 font-mono text-xs font-semibold">
                      +{currentQuestion.marks || 2} Marks
                    </span>
                    {(reviewMode || isConcluded || isSubmitted) && (
                      answers[currentQuestion.id]?.selectedOption !== null && answers[currentQuestion.id]?.selectedOption !== undefined ? (
                        <span className="px-3 py-1 rounded-full border border-emerald-500/50 bg-emerald-950/60 text-[#00F5A0] font-mono text-xs font-bold">
                          Submitted: Option {String.fromCharCode(65 + (answers[currentQuestion.id]?.selectedOption ?? 0))}
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-full border border-slate-700 bg-slate-900/80 text-slate-400 font-mono text-xs font-bold">
                          Unanswered / Not Submitted
                        </span>
                      )
                    )}
                  </div>

                  {!reviewMode && !isSubmitted && (
                    <button
                      onClick={handleToggleFlag}
                      className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                        answers[currentQuestion.id]?.isFlagged
                          ? 'border-2 border-amber-400 bg-amber-950/50 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                          : 'border border-[#0D3E2E] bg-[#010906] hover:bg-[#031C15] text-slate-300 hover:text-white'
                      }`}
                    >
                      <Flag
                        className={`w-3.5 h-3.5 ${
                          answers[currentQuestion.id]?.isFlagged
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-slate-400'
                        }`}
                      />
                      <span>
                        {answers[currentQuestion.id]?.isFlagged
                          ? 'Flagged for Review'
                          : 'Flag Question'}
                      </span>
                    </button>
                  )}
                </div>

                {/* Question Title & Description */}
                <div className="mt-5 mb-6 space-y-2">
                  <h2 className="text-xl font-bold text-white tracking-wide">
                    {currentQuestion.title}
                  </h2>
                  <div className="text-sm text-slate-300 leading-relaxed font-sans whitespace-pre-wrap">
                    {currentQuestion.description}
                  </div>
                </div>

                {/* 4 Selectable Answer Cards (A, B, C, D) */}
                <div className="space-y-3 pt-1">
                  {currentQuestion.options?.map((optionText, optIdx) => {
                    const isSelected = answers[currentQuestion.id]?.selectedOption === optIdx;

                    return (
                      <div
                        key={optIdx}
                        onClick={() => handleSelectOption(optIdx)}
                        className={`p-4 rounded-xl border transition-all flex items-center justify-between ${
                          reviewMode || isSubmitted || isConcluded || isLocked || timer.isExpired || effectiveIsPaused
                            ? 'cursor-default'
                            : 'cursor-pointer'
                        } ${
                          isSelected
                            ? 'border-2 border-[#00F5A0] bg-[#04281E]/80 shadow-[0_0_15px_rgba(0,245,160,0.25)]'
                            : 'border border-[#0D3E2E] bg-[#010906]/80 hover:border-emerald-700/60 hover:bg-[#02130F]'
                        }`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                          {/* Option Badge Circle */}
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center font-mono font-bold text-xs shrink-0 transition-colors ${
                              isSelected
                                ? 'bg-[#00F5A0] text-black font-black shadow-[0_0_8px_#00F5A0]'
                                : 'bg-[#02130F] text-slate-300 border border-[#0D3E2E]'
                            }`}
                          >
                            {String.fromCharCode(65 + optIdx)}
                          </div>

                          {/* Option Text */}
                          <span
                            className={`text-sm font-mono truncate ${
                              isSelected ? 'font-bold text-white' : 'text-slate-300'
                            }`}
                          >
                            {optionText}
                          </span>
                        </div>

                        {/* Selected Checkmark Indicator */}
                        {isSelected && (
                          <div className="flex items-center gap-2 shrink-0 ml-3">
                            {reviewMode && (
                              <span className="text-[10px] font-mono font-bold text-[#00F5A0] bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 rounded-md hidden sm:inline">
                                Your Selection
                              </span>
                            )}
                            <CheckCircle2 className="w-5 h-5 text-[#00F5A0]" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bottom Navigation Toolbar */}
              <div className="pt-4 border-t border-[#0D382B] flex items-center justify-between mt-8">
                {/* Previous Button */}
                <button
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                  className="px-5 py-2 rounded-xl border border-[#0D3E2E] bg-[#010906] hover:bg-[#031C15] text-slate-400 hover:text-white font-mono font-bold text-xs flex items-center gap-1.5 disabled:opacity-30 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Previous</span>
                </button>

                {/* Question Position */}
                <div className="text-xs font-mono font-bold text-slate-400">
                  {currentIndex + 1} / {questions.length}
                </div>

                {/* Next / Submit Button */}
                {currentIndex < questions.length - 1 ? (
                  <button
                    onClick={() =>
                      setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))
                    }
                    className="px-6 py-2 rounded-xl bg-[#00F5A0] hover:bg-[#34D399] text-black font-black font-mono text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-[0_0_12px_rgba(0,245,160,0.4)] transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-4 h-4 stroke-[3]" />
                  </button>
                ) : reviewMode || isSubmitted ? (
                  <button
                    onClick={() => setReviewMode(false)}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-[#00F5A0] text-black font-black font-mono text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-[0_0_12px_rgba(0,245,160,0.4)] transition-all hover:scale-[1.02]"
                  >
                    <span>Back to Score Card</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmSubmitOpen(true)}
                    className="px-6 py-2 rounded-xl bg-gradient-to-r from-[#00D98A] to-[#00F5A0] hover:from-[#00F5A0] hover:to-[#34D399] text-black font-black font-mono text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-[0_0_15px_rgba(0,245,160,0.4)] transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                  >
                    <span>Review &amp; Submit</span>
                    <Send className="w-3.5 h-3.5 text-black" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 font-mono text-xs">
              No questions available.
            </div>
          )}
        </section>
      </main>

      {/* ===================================================================== */}
      {/* 4. SUBMISSION CONFIRMATION MODAL                                      */}
      {/* ===================================================================== */}
      {confirmSubmitOpen && !isSubmitted && !reviewMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-fade-in">
          <div className="bg-[#031712] rounded-3xl max-w-md w-full border border-[#00F5A0]/50 shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 border-b border-[#0D382B] pb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-[#00F5A0] border border-emerald-500/30 flex items-center justify-center shrink-0">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Submit Round 1 MCQ Arena?</h3>
                <p className="text-xs text-slate-400 font-mono">
                  Review your attempt summary before final submission.
                </p>
              </div>
            </div>

            <div className="p-4 bg-[#010906] rounded-xl border border-[#0D3E2E] space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Total Questions:</span>
                <span className="font-bold text-white">{questions.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#00F5A0] font-bold">Answered:</span>
                <span className="font-bold text-[#00F5A0]">{answeredCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-400">Flagged for Review:</span>
                <span className="font-bold text-amber-400">{flaggedCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Unanswered:</span>
                <span className="font-bold text-slate-400">{unansweredCount}</span>
              </div>
            </div>

            {unansweredCount > 0 && (
              <p className="text-[11px] font-mono text-amber-300 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/30">
                You still have <strong>{unansweredCount} unanswered questions</strong>. Once submitted, answers cannot be edited.
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 font-mono text-xs">
              <button
                onClick={() => setConfirmSubmitOpen(false)}
                className="px-4 py-2 border border-[#0D3E2E] rounded-xl text-slate-300 hover:text-white font-bold hover:bg-[#04241B] transition-colors"
              >
                Keep Answering
              </button>
              <button
                onClick={() => handleFinalSubmit(false)}
                disabled={submitting}
                className="px-5 py-2 bg-gradient-to-r from-[#00D98A] to-[#00F5A0] hover:from-[#00F5A0] hover:to-[#34D399] text-black font-black uppercase tracking-wider rounded-xl shadow-[0_0_15px_rgba(0,245,160,0.4)] disabled:opacity-50 inline-flex items-center gap-1.5 transition-all"
              >
                {submitting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-black" />
                ) : (
                  <Check className="w-3.5 h-3.5 text-black stroke-[3]" />
                )}
                <span>{submitting ? 'Submitting...' : 'Confirm Submission'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#02130a] rounded-2xl border border-emerald-500/40 shadow-[0_0_30px_rgba(0,0,0,0.8)] p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-amber-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Confirm Sign Out</h3>
                <p className="text-xs font-mono text-emerald-400">MCQ Arena Session</p>
              </div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed font-sans">
              Are you sure you want to sign out? Your saved answers remain securely stored on the server.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-emerald-950">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs font-mono font-semibold text-slate-300 hover:text-white hover:bg-emerald-950/50 border border-emerald-500/30 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowLogoutConfirm(false);
                  await handleLogout();
                }}
                className="px-4 py-2 rounded-xl text-xs font-mono font-bold text-white bg-rose-600 hover:bg-rose-500 transition-colors shadow-sm cursor-pointer flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Confirm Log Out</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* REQUIREMENT 5: RETURN TO DASHBOARD WARNING MODAL */}
      {showLeaveWarningModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#031712] border-2 border-amber-400/80 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-[0_0_30px_rgba(245,158,11,0.3)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-amber-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Return to Dashboard?</h3>
                <p className="text-xs font-mono text-amber-400">Round 1 is Currently Active</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Your competition round is currently active. Returning to the dashboard will not stop the countdown, and your time will continue running.
            </p>
            <p className="text-xs text-amber-300/90 font-medium">
              Are you sure you want to leave the workspace?
            </p>

            <div className="flex justify-end gap-3 pt-2 font-mono text-xs">
              <button
                type="button"
                onClick={() => setShowLeaveWarningModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Stay in Workspace
              </button>
              <button
                type="button"
                onClick={() => navigate('/team/dashboard')}
                className="px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-bold uppercase tracking-wider transition-all cursor-pointer shadow-md"
              >
                Return to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REQUIREMENT 6: COMPETITION FOCUS WARNING MODAL */}
      {focusWarning && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#031712] border-2 border-amber-400 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-[0_0_40px_rgba(245,158,11,0.35)] text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-amber-400 mx-auto shadow-inner">
              <AlertTriangle className="w-7 h-7 animate-bounce" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white">Competition Focus Warning</h3>
              <p className="text-xs font-mono text-amber-400 font-semibold">
                Warning {focusWarning.violationCount} of {focusWarning.threshold}
              </p>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              You have left the active competition workspace. Switching tabs or leaving the competition environment is not permitted during the competition.
            </p>
            <p className="text-[11px] text-amber-300/80 font-mono">
              Please return to your workspace immediately. Continued departures will trigger official access revocation.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={clearWarning}
                className="w-full py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-bold uppercase font-mono text-xs tracking-wider transition-all cursor-pointer shadow-md"
              >
                I Understand & Return to Workspace
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ANTI-CHEAT EXAM-LOCK OVERLAY */}
      <ExamLockOverlay
        isOpen={isLockedByProctoring}
        lockStatus={lockStatus}
        isDisqualified={isDisqualified}
        lockReason={lockReason}
        warningCount={warningCount}
        onRefreshStatus={refreshStatus}
        onReturnToDashboard={() => navigate('/team/dashboard')}
      />

      {/* REQUIREMENT 3 & 4: ROUND CONCLUDED / WORKSPACE LOCKED MODAL */}
      {showConcludedModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#02130a] border-2 border-emerald-400/60 rounded-3xl max-w-lg w-full p-7 sm:p-8 space-y-5 text-center shadow-[0_0_50px_rgba(16,185,129,0.35)]">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-400/60 flex items-center justify-center text-emerald-400 mx-auto shadow-[0_0_20px_rgba(16,185,129,0.5)]">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <div className="space-y-2">
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                ROUND CONCLUDED
              </span>
              <h3 className="text-2xl font-black text-white">Workspace Locked</h3>
              <p className="text-sm text-emerald-200/90 max-w-md mx-auto leading-relaxed">
                The competition time has ended. Your workspace is now locked.
              </p>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                Your submitted answers have been safely recorded.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-black/60 border border-emerald-500/30 font-mono text-center">
              <span className="text-xs text-emerald-400 font-bold">
                Submission Status: <span className="text-white">Submitted</span>
              </span>
            </div>
            <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-3 font-mono text-xs">
              <button
                type="button"
                onClick={() => {
                  setShowConcludedModal(false);
                  setReviewMode(true);
                }}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white font-bold transition-colors cursor-pointer"
              >
                View Submitted Answers
              </button>
              <Link
                to="/team/dashboard"
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#00F5A0] hover:bg-[#34D399] text-black font-black uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(0,245,160,0.4)]"
              >
                Return to Dashboard
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
