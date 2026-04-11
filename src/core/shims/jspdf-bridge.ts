import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

void autoTable;
(window as unknown as { jspdf?: { jsPDF: typeof jsPDF } }).jspdf = { jsPDF };
