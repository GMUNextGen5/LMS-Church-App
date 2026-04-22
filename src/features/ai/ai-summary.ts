/**
 * AI Summary & Study Tips — Cloud Function calls for AI analysis
 */

import { showModal, showLoading, hideLoading } from '../../ui';
import { functions, httpsCallable } from '../../firebase';

/**
 * Generate AI Performance Summary via Cloud Function
 */
export async function generatePerformanceSummary(studentId: string): Promise<void> {
  console.log('🤖 [generatePerformanceSummary] Starting', { studentId });

  try {
    showLoading();

    const getPerformanceSummary = httpsCallable(functions, 'getPerformanceSummary');
    const result = await getPerformanceSummary({ studentId });
    const data = result.data as any;

    showModal(
      `Performance Summary - ${data.studentName}`,
      data.summaryHtml
    );

    console.log('✅ [generatePerformanceSummary] Success', {
      studentName: data.studentName,
      generatedAt: data.generatedAt,
      metadata: data.metadata
    });
  } catch (error: any) {
    console.error('❌ [generatePerformanceSummary] Error:', {
      error: error.message,
      code: error.code,
      studentId
    });
    alert(`Failed to generate summary: ${error.message || 'Unknown error occurred'}`);
  } finally {
    hideLoading();
  }
}

/**
 * Generate AI Study Tips via Cloud Function
 */
export async function generateStudyTips(studentId: string): Promise<void> {
  console.log('🤖 [generateStudyTips] Starting', { studentId });

  try {
    showLoading();

    const getStudyTips = httpsCallable(functions, 'getStudyTips');
    const result = await getStudyTips({ studentId });
    const data = result.data as any;

    showModal(
      `Study Tips - ${data.studentName}`,
      data.tipsHtml
    );

    console.log('✅ [generateStudyTips] Success', {
      studentName: data.studentName,
      generatedAt: data.generatedAt,
      metadata: data.metadata
    });
  } catch (error: any) {
    console.error('❌ [generateStudyTips] Error:', {
      error: error.message,
      code: error.code,
      studentId
    });
    alert(`Failed to generate study tips: ${error.message || 'Unknown error occurred'}`);
  } finally {
    hideLoading();
  }
}
