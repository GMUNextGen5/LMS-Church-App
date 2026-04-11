import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

(window as unknown as { Chart?: typeof Chart }).Chart = Chart;
