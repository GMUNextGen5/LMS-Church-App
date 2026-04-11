/**
 * Unit tests for AI config data helpers and prompt builders.
 * Covers security (sanitization, limits), edge cases, and correctness.
 */
import {
  sanitizeForPrompt,
  prepareGradesData,
  prepareAttendanceData,
  calculateCategoryAverages,
  buildPerformanceSummaryPrompt,
  buildStudyTipsPrompt,
  MAX_GRADES_FOR_PROMPT,
  MAX_ATTENDANCE_FOR_PROMPT,
  MAX_PROMPT_STRING_LENGTH,
  getApiKey,
} from './ai-config';

describe('sanitizeForPrompt', () => {
  it('returns empty string for null and undefined', () => {
    expect(sanitizeForPrompt(null)).toBe('');
    expect(sanitizeForPrompt(undefined)).toBe('');
  });

  it('converts non-strings to string', () => {
    expect(sanitizeForPrompt(123)).toBe('123');
    expect(sanitizeForPrompt(true)).toBe('true');
  });

  it('strips control characters', () => {
    expect(sanitizeForPrompt('a\x00b\x1fc')).toBe('abc');
    expect(sanitizeForPrompt('hello\x7fworld')).toBe('helloworld');
  });

  it('trims whitespace', () => {
    expect(sanitizeForPrompt('  name  ')).toBe('name');
  });

  it('truncates to default max length', () => {
    const long = 'a'.repeat(MAX_PROMPT_STRING_LENGTH + 100);
    expect(sanitizeForPrompt(long).length).toBe(MAX_PROMPT_STRING_LENGTH);
  });

  it('truncates to custom max length', () => {
    const s = 'hello world';
    expect(sanitizeForPrompt(s, 5)).toBe('hello');
  });

  it('does not truncate when under limit', () => {
    expect(sanitizeForPrompt('Alice')).toBe('Alice');
  });
});

describe('prepareGradesData', () => {
  it('returns empty array for non-array input', () => {
    expect(prepareGradesData(null as any)).toEqual([]);
    expect(prepareGradesData(undefined as any)).toEqual([]);
    expect(prepareGradesData({} as any)).toEqual([]);
  });

  it('handles empty array', () => {
    expect(prepareGradesData([])).toEqual([]);
  });

  it('formats valid grade with percentage', () => {
    const result = prepareGradesData([
      { assignmentName: 'Quiz 1', category: 'Quiz', score: 8, totalPoints: 10, date: '2024-01-01' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      assignment: 'Quiz 1',
      category: 'Quiz',
      score: 8,
      total: 10,
      percentage: '80.0%',
    });
  });

  it('handles zero totalPoints without NaN', () => {
    const result = prepareGradesData([
      { assignmentName: 'X', category: 'Y', score: 5, totalPoints: 0, date: null },
    ]);
    expect(result[0].percentage).toBe('0%');
    expect(result[0].score).toBe(5);
    expect(result[0].total).toBe(0);
  });

  it('uses fallbacks for missing assignment/category', () => {
    const result = prepareGradesData([
      { score: 10, totalPoints: 10 },
    ]);
    expect(result[0].assignment).toBe('Unknown');
    expect(result[0].category).toBe('Uncategorized');
  });

  it('clamps negative score to 0', () => {
    const result = prepareGradesData([
      { assignmentName: 'A', category: 'C', score: -5, totalPoints: 10 },
    ]);
    expect(result[0].score).toBe(0);
    expect(result[0].percentage).toBe('0.0%');
  });

  it('handles NaN from invalid numbers', () => {
    const result = prepareGradesData([
      { assignmentName: 'A', category: 'C', score: NaN, totalPoints: 10 },
    ]);
    expect(result[0].score).toBe(0);
    expect(result[0].total).toBe(10);
  });

  it('limits input to MAX_GRADES_FOR_PROMPT', () => {
    const many = Array.from({ length: MAX_GRADES_FOR_PROMPT + 50 }, (_, i) => ({
      assignmentName: `A${i}`,
      category: 'Quiz',
      score: 5,
      totalPoints: 10,
      date: null,
    }));
    const result = prepareGradesData(many);
    expect(result.length).toBe(MAX_GRADES_FOR_PROMPT);
  });

  it('sanitizes assignment and category strings', () => {
    const result = prepareGradesData([
      { assignmentName: 'Normal', category: 'Quiz\x00Injection', score: 5, totalPoints: 10 },
    ]);
    expect(result[0].category).not.toContain('\x00');
    expect(result[0].assignment).toBe('Normal');
  });
});

describe('prepareAttendanceData', () => {
  it('returns zeros for non-array input', () => {
    const out = prepareAttendanceData(null as any);
    expect(out).toEqual({ total: 0, present: 0, absent: 0, late: 0, excused: 0, attendanceRate: '0%' });
  });

  it('handles empty array', () => {
    const out = prepareAttendanceData([]);
    expect(out.total).toBe(0);
    expect(out.present).toBe(0);
    expect(out.attendanceRate).toBe('0%');
  });

  it('counts only known statuses', () => {
    const out = prepareAttendanceData([
      { status: 'present' },
      { status: 'absent' },
      { status: 'late' },
      { status: 'excused' },
      { status: 'unknown' },
      { status: '' },
      {},
    ]);
    expect(out.total).toBe(7);
    expect(out.present).toBe(1);
    expect(out.absent).toBe(1);
    expect(out.late).toBe(1);
    expect(out.excused).toBe(1);
    expect(out.attendanceRate).toBe('42.9%'); // present + late + excused = 3, 3/7
  });

  it('computes attendance rate correctly', () => {
    const out = prepareAttendanceData([
      { status: 'present' },
      { status: 'present' },
      { status: 'absent' },
    ]);
    expect(out.total).toBe(3);
    expect(out.present).toBe(2);
    expect(out.absent).toBe(1);
    expect(out.attendanceRate).toBe('66.7%');
  });

  it('limits input to MAX_ATTENDANCE_FOR_PROMPT', () => {
    const many = Array.from({ length: MAX_ATTENDANCE_FOR_PROMPT + 20 }, () => ({ status: 'present' }));
    const out = prepareAttendanceData(many);
    expect(out.total).toBe(MAX_ATTENDANCE_FOR_PROMPT);
    expect(out.present).toBe(MAX_ATTENDANCE_FOR_PROMPT);
  });
});

describe('calculateCategoryAverages', () => {
  it('returns empty array for non-array input', () => {
    expect(calculateCategoryAverages(null as any)).toEqual([]);
    expect(calculateCategoryAverages(undefined as any)).toEqual([]);
  });

  it('handles empty array', () => {
    expect(calculateCategoryAverages([])).toEqual([]);
  });

  it('skips grades with totalPoints <= 0 or invalid score', () => {
    const result = calculateCategoryAverages([
      { category: 'Quiz', score: 5, totalPoints: 0 },
      { category: 'Quiz', score: -1, totalPoints: 10 },
    ]);
    expect(result).toEqual([]);
  });

  it('computes category averages and trend', () => {
    const grades = [
      { category: 'Quiz', score: 50, totalPoints: 100 },
      { category: 'Quiz', score: 60, totalPoints: 100 },
      { category: 'Quiz', score: 70, totalPoints: 100 },
      { category: 'Quiz', score: 80, totalPoints: 100 },
      { category: 'Test', score: 90, totalPoints: 100 },
    ];
    const result = calculateCategoryAverages(grades);
    expect(result).toHaveLength(2);
    const quiz = result.find(r => r.category === 'Quiz');
    const test = result.find(r => r.category === 'Test');
    expect(quiz?.average).toBe('65.0%');
    expect(quiz?.count).toBe(4);
    expect(quiz?.trend).toBe('improving');
    expect(test?.average).toBe('90.0%');
    expect(test?.count).toBe(1);
    expect(test?.trend).toBe('stable');
  });

  it('uses fallback category for missing', () => {
    const result = calculateCategoryAverages([
      { score: 10, totalPoints: 10 },
    ]);
    expect(result[0].category).toBe('Uncategorized');
  });

  it('limits input to MAX_GRADES_FOR_PROMPT', () => {
    const many = Array.from({ length: MAX_GRADES_FOR_PROMPT + 30 }, (_, i) => ({
      category: `Cat${i % 5}`,
      score: 50,
      totalPoints: 100,
    }));
    const result = calculateCategoryAverages(many);
    const totalCount = result.reduce((s, r) => s + r.count, 0);
    expect(totalCount).toBe(MAX_GRADES_FOR_PROMPT);
  });
});

describe('buildPerformanceSummaryPrompt', () => {
  it('includes sanitized student name and safe numbers', () => {
    const prompt = buildPerformanceSummaryPrompt(
      '  Alice Smith  ',
      [{ assignment: 'Q1', score: 8, total: 10, percentage: '80%' }],
      { total: 10, present: 8, absent: 1, late: 1 }
    );
    expect(prompt).toContain('Student Name: Alice Smith');
    expect(prompt).toContain('Total records: 10');
    expect(prompt).toContain('Attendance Rate: 90.0%');
  });

  it('handles null/undefined attendanceData fields', () => {
    const prompt = buildPerformanceSummaryPrompt(
      'Bob',
      [],
      { total: 0, present: 0, absent: 0, late: 0 }
    );
    expect(prompt).toContain('Attendance Rate: 0%');
  });

  it('limits gradesData length', () => {
    const manyGrades = Array.from({ length: MAX_GRADES_FOR_PROMPT + 50 }, (_, i) => ({ assignment: `A${i}`, score: 5, total: 10, percentage: '50%' }));
    const prompt = buildPerformanceSummaryPrompt('X', manyGrades, { total: 0, present: 0, absent: 0, late: 0 });
    const jsonMatch = prompt.match(/Recent Grades[^[]*\[/);
    expect(jsonMatch).toBeTruthy();
    const afterBracket = prompt.slice(prompt.indexOf('['));
    const count = (afterBracket.match(/"assignment"/g) || []).length;
    expect(count).toBe(MAX_GRADES_FOR_PROMPT);
  });

  it('sanitizes student name (no control chars in prompt)', () => {
    const prompt = buildPerformanceSummaryPrompt('Bad\x00Name', [], { total: 0, present: 0, absent: 0, late: 0 });
    expect(prompt).not.toContain('\x00');
    expect(prompt).toContain('Student Name:');
  });
});

describe('buildStudyTipsPrompt', () => {
  it('includes sanitized name and limits arrays', () => {
    const prompt = buildStudyTipsPrompt(
      'Charlie',
      [{ category: 'Quiz', average: '75%', count: 4 }],
      ['- Quiz 1: 80%', '- Quiz 2: 70%']
    );
    expect(prompt).toContain('Student Name: Charlie');
    expect(prompt).toContain('Quiz');
    expect(prompt).toContain('Quiz 1: 80%');
  });

  it('handles non-array categoryAverages and recentAssignments', () => {
    const prompt = buildStudyTipsPrompt('Dana', null as any, null as any);
    expect(prompt).toContain('Student Name: Dana');
    expect(prompt).toContain('Performance by Category:');
    expect(prompt).toContain('Recent Assignments:');
  });

  it('limits recentAssignments and sanitizes each', () => {
    const longList = Array.from({ length: 50 }, (_, i) => `Assignment ${i}`);
    const prompt = buildStudyTipsPrompt('Eve', [], longList);
    const after = prompt.split('Recent Assignments:')[1];
    const assignmentsBlock = after.split('\n\nPlease')[0].trim();
    const lines = assignmentsBlock ? assignmentsBlock.split('\n') : [];
    expect(lines.length).toBe(30);
  });
});

describe('getApiKey', () => {
  it('returns string (empty when unset)', () => {
    const key = getApiKey();
    expect(typeof key).toBe('string');
  });
});
