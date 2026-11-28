import React, { useState, useEffect, useMemo } from 'react';
import {
  Database,
  Download,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Lock,
  Users,
  Table2,
  Columns3,
  Loader2,
  AlertTriangle,
  Eye,
  X,
  RotateCcw,
} from 'lucide-react';

export interface DatasetRow {
  participant_id: string;
  participant_name: string;
  team_id: string;
  team_name: string;
  department: string;
  team_rank: number;
  participant_round_1_score: number;
  participant_round_2_score: number;
  participant_round_3_score: number;
  participant_total_score: number;
  team_round_1_score: number;
  team_round_2_score: number;
  team_round_3_score: number;
  team_total_score: number;
  team_member_count: number;
  submission_count: number;
  accepted_submission_count: number;
  wrong_answer_count: number;
  compilation_error_count: number;
  runtime_error_count: number;
  time_limit_exceeded_count: number;
  submission_ids: string;
  duplicate_submission_id_count: number;
}

type ColumnKey = keyof DatasetRow;

interface ColumnDef {
  key: ColumnKey;
  label: string;
  type: 'string' | 'int' | 'score' | 'ids';
  highlight?: 'emerald' | 'gold' | 'rank';
}

export const DATASET_COLUMNS: ColumnDef[] = [
  { key: 'participant_id', label: 'Participant ID', type: 'string' },
  { key: 'participant_name', label: 'Participant Name', type: 'string' },
  { key: 'team_id', label: 'Team ID', type: 'string' },
  { key: 'team_name', label: 'Team Name', type: 'string' },
  { key: 'department', label: 'Department', type: 'string' },
  { key: 'team_rank', label: 'Team Rank', type: 'int', highlight: 'rank' },
  { key: 'participant_round_1_score', label: 'P. R1 Score', type: 'score' },
  { key: 'participant_round_2_score', label: 'P. R2 Score', type: 'score' },
  { key: 'participant_round_3_score', label: 'P. R3 Score', type: 'score' },
  { key: 'participant_total_score', label: 'P. Total Score', type: 'score', highlight: 'emerald' },
  { key: 'team_round_1_score', label: 'Team R1 Score', type: 'score' },
  { key: 'team_round_2_score', label: 'Team R2 Score', type: 'score' },
  { key: 'team_round_3_score', label: 'Team R3 Score', type: 'score' },
  { key: 'team_total_score', label: 'Team Total Score', type: 'score', highlight: 'gold' },
  { key: 'team_member_count', label: 'Members', type: 'int' },
  { key: 'submission_count', label: 'Submissions', type: 'int' },
  { key: 'accepted_submission_count', label: 'Accepted', type: 'int', highlight: 'emerald' },
  { key: 'wrong_answer_count', label: 'Wrong Ans', type: 'int' },
  { key: 'compilation_error_count', label: 'Compile Err', type: 'int' },
  { key: 'runtime_error_count', label: 'Runtime Err', type: 'int' },
  { key: 'time_limit_exceeded_count', label: 'TLE', type: 'int' },
  { key: 'submission_ids', label: 'Submission IDs', type: 'ids' },
  { key: 'duplicate_submission_id_count', label: 'Duplicates', type: 'int' },
];

const CSV_URL = '/IGNITRON_Round3_Simple_100_Record_Dataset.csv';

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

export const Round3DatasetExplorer: React.FC = () => {
  const [rows, setRows] = useState<DatasetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Toolbar filters
  const [searchQuery, setSearchQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [rowsPerPage, setRowsPerPage] = useState<10 | 25 | 50 | 100>(25);
  const [page, setPage] = useState(1);

  // Sorting
  const [sortKey, setSortKey] = useState<ColumnKey>('participant_id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Expandable submission_ids modal
  const [expandedRow, setExpandedRow] = useState<DatasetRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(CSV_URL, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load dataset (${res.status})`);
        return res.text();
      })
      .then((text) => {
        if (cancelled) return;
        const cleanText = text.replace(/^\uFEFF/, '');
        const lines = cleanText.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length < 2) throw new Error('Dataset CSV is empty.');
        const headers = parseCsvLine(lines[0]);
        const parsed: DatasetRow[] = [];
        for (let i = 1; i < lines.length; i++) {
          const vals = parseCsvLine(lines[i]);
          const raw: Record<string, string> = {};
          headers.forEach((h, idx) => {
            raw[h.trim()] = (vals[idx] ?? '').trim();
          });
          parsed.push({
            participant_id: raw.participant_id,
            participant_name: raw.participant_name,
            team_id: raw.team_id,
            team_name: raw.team_name,
            department: raw.department,
            team_rank: Number(raw.team_rank),
            participant_round_1_score: Number(raw.participant_round_1_score),
            participant_round_2_score: Number(raw.participant_round_2_score),
            participant_round_3_score: Number(raw.participant_round_3_score),
            participant_total_score: Number(raw.participant_total_score),
            team_round_1_score: Number(raw.team_round_1_score),
            team_round_2_score: Number(raw.team_round_2_score),
            team_round_3_score: Number(raw.team_round_3_score),
            team_total_score: Number(raw.team_total_score),
            team_member_count: Number(raw.team_member_count),
            submission_count: Number(raw.submission_count),
            accepted_submission_count: Number(raw.accepted_submission_count),
            wrong_answer_count: Number(raw.wrong_answer_count),
            compilation_error_count: Number(raw.compilation_error_count),
            runtime_error_count: Number(raw.runtime_error_count),
            time_limit_exceeded_count: Number(raw.time_limit_exceeded_count),
            submission_ids: raw.submission_ids,
            duplicate_submission_id_count: Number(raw.duplicate_submission_id_count),
          });
        }
        setRows(parsed);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Failed to load dataset.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Distinct dropdown options
  const teamOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (!map.has(r.team_id)) map.set(r.team_id, r.team_name);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const departmentOptions = useMemo(() => {
    return Array.from(new Set(rows.map((r) => r.department))).sort();
  }, [rows]);

  // Filter & Sort
  const filteredAndSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (teamFilter !== 'ALL' && r.team_id !== teamFilter) return false;
      if (departmentFilter !== 'ALL' && r.department !== departmentFilter) return false;
      if (!q) return true;
      return Object.values(r).some((v) => String(v).toLowerCase().includes(q));
    });

    const colDef = DATASET_COLUMNS.find((c) => c.key === sortKey);
    const isNum = colDef?.type === 'int' || colDef?.type === 'score';
    const sorted = [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp = 0;
      if (isNum) {
        cmp = Number(av) - Number(bv);
      } else {
        cmp = String(av).localeCompare(String(bv));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [rows, searchQuery, teamFilter, departmentFilter, sortKey, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, teamFilter, departmentFilter, rowsPerPage]);

  const totalFiltered = filteredAndSorted.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / rowsPerPage));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * rowsPerPage;
  const pageRows = filteredAndSorted.slice(startIdx, startIdx + rowsPerPage);

  const handleSort = (key: ColumnKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleDownloadCsv = () => {
    const link = document.createElement('a');
    link.href = CSV_URL;
    link.download = 'IGNITRON_Round3_Simple_100_Record_Dataset.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasActiveFilters = searchQuery.trim() !== '' || teamFilter !== 'ALL' || departmentFilter !== 'ALL';

  if (loading) {
    return (
      <div className="rounded-2xl bg-[#03130a]/90 border border-emerald-900/55 p-12 text-center space-y-3">
        <Loader2 className="mx-auto w-7 h-7 text-emerald-400 animate-spin" />
        <p className="text-xs font-mono text-emerald-300/75">Loading IGNITRON Event Intelligence Dataset (100 records, 23 columns)…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-rose-950/60 border border-rose-500/40 p-8 text-center space-y-2">
        <AlertTriangle className="mx-auto w-8 h-8 text-rose-400" />
        <p className="text-sm text-rose-200">{error}</p>
      </div>
    );
  }

  return (
    <section className="space-y-4">
      {/* ─── Dataset Header + Statistics ─── */}
      <div className="rounded-2xl bg-[#03130a]/95 border border-emerald-900/55 p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center shrink-0">
            <Database className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                IGNITRON Event Intelligence Dataset
              </h2>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono font-bold uppercase tracking-wider">
                <Lock className="w-2.5 h-2.5" /> Read-Only
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Official Round 3 reference dataset — complete participant, team, ranking, and submission telemetry.
            </p>
          </div>
        </div>

        {/* Stats Pills */}
        <div className="grid grid-cols-3 rounded-xl bg-[#020c06] border border-emerald-900/60 divide-x divide-emerald-900/60 shrink-0">
          <div className="px-4 py-2 text-center">
            <div className="flex items-center justify-center gap-1 text-sm font-black text-white">
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              <span>{rows.length}</span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono">Participant Records</div>
          </div>
          <div className="px-4 py-2 text-center">
            <div className="flex items-center justify-center gap-1 text-sm font-black text-white">
              <Columns3 className="w-3.5 h-3.5 text-amber-400" />
              <span>{DATASET_COLUMNS.length}</span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono">Columns</div>
          </div>
          <div className="px-4 py-2 text-center">
            <div className="flex items-center justify-center gap-1 text-sm font-black text-white">
              <Table2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>{teamOptions.length}</span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono">Teams</div>
          </div>
        </div>
      </div>

      {/* ─── Dataset Toolbar ─── */}
      <div className="rounded-2xl bg-[#03130a]/95 border border-emerald-900/55 p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
          {/* Global Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search ID, name, team, department, SUB_..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#020b06] border border-emerald-900/60 text-xs text-slate-100 placeholder-slate-500 focus:border-emerald-400/60 focus:outline-none"
            />
          </div>

          {/* Team Filter */}
          <select
            aria-label="Filter by Team"
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-[#020b06] border border-emerald-900/60 text-xs text-slate-200 focus:border-emerald-400/60 focus:outline-none cursor-pointer"
          >
            <option value="ALL">All Teams ({teamOptions.length})</option>
            {teamOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {id} — {name}
              </option>
            ))}
          </select>

          {/* Department Filter */}
          <select
            aria-label="Filter by Department"
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-[#020b06] border border-emerald-900/60 text-xs text-slate-200 focus:border-emerald-400/60 focus:outline-none cursor-pointer max-w-[220px]"
          >
            <option value="ALL">All Departments ({departmentOptions.length})</option>
            {departmentOptions.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setTeamFilter('ALL');
                setDepartmentFilter('ALL');
              }}
              className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white text-xs cursor-pointer transition"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          )}
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {/* Rows per page */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="font-mono text-[11px]">Rows:</span>
            <select
              aria-label="Rows per page"
              value={rowsPerPage}
              onChange={(e) => setRowsPerPage(Number(e.target.value) as 10 | 25 | 50 | 100)}
              className="px-2.5 py-1.5 rounded-xl bg-[#020b06] border border-emerald-900/60 text-xs font-mono font-bold text-emerald-300 focus:border-emerald-400/60 focus:outline-none cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          {/* Download CSV */}
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold text-xs shadow-[0_0_14px_rgba(16,185,129,0.25)] transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download CSV</span>
          </button>
        </div>
      </div>

      {/* ─── Full-Width 23-Column Data Table ─── */}
      <div className="rounded-2xl bg-[#03130a]/95 border border-emerald-900/55 shadow-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-20 bg-[#051d10] shadow-[0_1px_0_rgba(16,185,129,0.25)]">
              <tr>
                {DATASET_COLUMNS.map((col, idx) => {
                  const isSorted = sortKey === col.key;
                  const isNumeric = col.type === 'int' || col.type === 'score';
                  const isStickyFirst = idx === 0;
                  return (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      title={`Field: ${col.key} (click to sort)`}
                      className={`px-3 py-2.5 border-b border-emerald-900/60 select-none cursor-pointer hover:bg-emerald-900/35 transition whitespace-nowrap ${
                        isStickyFirst ? 'sticky left-0 z-30 bg-[#051d10] border-r border-emerald-900/50' : ''
                      } ${isNumeric ? 'text-right' : 'text-left'}`}
                    >
                      <div className={`inline-flex items-center gap-1.5 ${isNumeric ? 'flex-row-reverse' : ''}`}>
                        <div>
                          <div className="font-bold text-[11px] text-emerald-200 tracking-wide">
                            {col.label}
                          </div>
                          <div className="font-mono text-[9px] text-slate-500 font-normal">
                            {col.key}
                          </div>
                        </div>
                        {isSorted ? (
                          sortDir === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-amber-400 shrink-0" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-amber-400 shrink-0" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-600 shrink-0" />
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={DATASET_COLUMNS.length} className="px-4 py-10 text-center text-slate-400 font-mono">
                    No matching participant records found.
                  </td>
                </tr>
              ) : (
                pageRows.map((row, rIdx) => {
                  const rowBg = rIdx % 2 === 0 ? 'bg-[#020c06]' : 'bg-[#04140b]';
                  const subIdsList = row.submission_ids ? row.submission_ids.split('|') : [];
                  return (
                    <tr
                      key={row.participant_id}
                      className={`${rowBg} hover:bg-emerald-900/25 border-b border-emerald-950/60 transition`}
                    >
                      {DATASET_COLUMNS.map((col, cIdx) => {
                        const val = row[col.key];
                        const isStickyFirst = cIdx === 0;
                        const isNumeric = col.type === 'int' || col.type === 'score';

                        if (isStickyFirst) {
                          return (
                            <td
                              key={col.key}
                              className={`sticky left-0 z-10 ${rowBg} px-3 py-2.5 font-mono font-bold text-emerald-300 border-r border-emerald-900/50 whitespace-nowrap`}
                            >
                              {val}
                            </td>
                          );
                        }

                        if (col.key === 'team_rank') {
                          return (
                            <td key={col.key} className="px-3 py-2.5 text-right font-mono whitespace-nowrap">
                              <span className="inline-flex items-center justify-center min-w-[28px] px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/35 text-amber-300 font-bold">
                                #{val}
                              </span>
                            </td>
                          );
                        }

                        if (col.type === 'ids') {
                          return (
                            <td
                              key={col.key}
                              title={String(val)}
                              className="px-3 py-2.5 font-mono text-[11px] text-slate-300 whitespace-nowrap"
                            >
                              <button
                                type="button"
                                onClick={() => setExpandedRow(row)}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-[#020a05] border border-emerald-900/60 hover:border-emerald-400/50 text-emerald-300/90 hover:text-emerald-200 transition cursor-pointer"
                              >
                                <span>
                                  {subIdsList.length > 0
                                    ? `${subIdsList[0]}…${subIdsList[subIdsList.length - 1]} (${subIdsList.length})`
                                    : String(val)}
                                </span>
                                <Eye className="w-3 h-3 text-amber-400" />
                              </button>
                            </td>
                          );
                        }

                        let cellClass = 'text-slate-200';
                        if (col.highlight === 'emerald') cellClass = 'text-emerald-300 font-bold';
                        else if (col.highlight === 'gold') cellClass = 'text-amber-300 font-bold';

                        const formatted =
                          col.type === 'score' ? Number(val).toFixed(2) : String(val);

                        return (
                          <td
                            key={col.key}
                            className={`px-3 py-2.5 whitespace-nowrap ${
                              isNumeric ? 'text-right font-mono tabular-nums' : 'text-left'
                            } ${cellClass}`}
                          >
                            {formatted}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ─── Pagination Footer ─── */}
        <div className="px-4 py-3 bg-[#04180d]/90 border-t border-emerald-900/50 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="font-mono text-slate-400">
            Showing{' '}
            <span className="text-white font-bold">
              {totalFiltered === 0 ? 0 : startIdx + 1}–{Math.min(startIdx + rowsPerPage, totalFiltered)}
            </span>{' '}
            of <span className="text-emerald-300 font-bold">{totalFiltered}</span> records
            {totalFiltered !== rows.length && (
              <span className="text-slate-500"> (filtered from {rows.length})</span>
            )}
          </div>

          <div className="flex items-center gap-1.5 font-mono">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#020c06] border border-emerald-900/60 text-slate-300 disabled:opacity-40 hover:border-emerald-500/50 cursor-pointer disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <span className="px-2.5 py-1 text-slate-300">
              Page <strong className="text-white">{safePage}</strong> / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#020c06] border border-emerald-900/60 text-slate-300 disabled:opacity-40 hover:border-emerald-500/50 cursor-pointer disabled:cursor-not-allowed transition"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ─── Expandable Submission IDs Modal (Preserves Complete Data) ─── */}
      {expandedRow && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-lg w-full rounded-2xl bg-[#031409] border border-emerald-500/45 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-emerald-900/50 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Complete Submission IDs — {expandedRow.participant_id} ({expandedRow.participant_name})
                </h3>
                <p className="text-xs text-slate-400">
                  Team: {expandedRow.team_id} ({expandedRow.team_name}) • {expandedRow.submission_count} Submissions • Duplicates: {expandedRow.duplicate_submission_id_count}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExpandedRow(null)}
                className="p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {expandedRow.submission_ids.split('|').map((subId) => (
                <span
                  key={subId}
                  className="px-2.5 py-1 rounded-lg bg-[#020b06] border border-emerald-800/60 font-mono text-xs text-emerald-300"
                >
                  {subId}
                </span>
              ))}
            </div>

            <div className="rounded-xl bg-[#020b06] border border-emerald-900/50 p-3 font-mono text-[11px] text-slate-300 break-all">
              {expandedRow.submission_ids}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
