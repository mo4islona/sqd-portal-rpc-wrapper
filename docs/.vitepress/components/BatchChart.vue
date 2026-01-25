<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';

const props = defineProps<{
  title: string;
  batchSizes: number[];
  wrapperData: number[];
  rpcData: number[];
}>();

const canvas = ref<HTMLCanvasElement | null>(null);
const isClient = ref(false);

onMounted(async () => {
  isClient.value = true;
  await nextTick();
  if (!canvas.value) return;

  const { Chart, registerables } = await import('chart.js');
  Chart.register(...registerables);

  new Chart(canvas.value, {
    type: 'line',
    data: {
      labels: props.batchSizes.map(s => s.toString()),
      datasets: [
        {
          label: 'Wrapper',
          data: props.wrapperData,
          borderColor: 'rgb(99, 102, 241)',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          borderWidth: 3,
          tension: 0.3,
          fill: true,
          pointRadius: 6,
          pointHoverRadius: 8,
          pointBackgroundColor: 'rgb(99, 102, 241)',
        },
        {
          label: 'Reference RPC',
          data: props.rpcData,
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          borderWidth: 3,
          tension: 0.3,
          fill: true,
          pointRadius: 6,
          pointHoverRadius: 8,
          pointBackgroundColor: 'rgb(34, 197, 94)',
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            usePointStyle: true,
            padding: 20,
            font: { size: 12 }
          }
        },
        title: {
          display: true,
          text: props.title,
          font: { size: 16, weight: 'bold' },
          padding: { bottom: 20 }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleFont: { size: 13 },
          bodyFont: { size: 12 },
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            title: (items) => `Batch size: ${items[0].label}`,
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)} ms`
          }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Batch Size',
            font: { size: 12 }
          },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Mean Latency (ms)',
            font: { size: 12 }
          },
          grid: { color: 'rgba(0, 0, 0, 0.05)' }
        }
      }
    }
  });
});
</script>

<template>
  <div class="chart-container">
    <canvas v-if="isClient" ref="canvas"></canvas>
    <div v-else class="chart-loading">Loading chart...</div>
  </div>
</template>

<style scoped>
.chart-container {
  position: relative;
  height: 350px;
  width: 100%;
  margin: 24px 0;
  padding: 16px;
  background: var(--vp-c-bg-soft);
  border-radius: 12px;
  border: 1px solid var(--vp-c-divider);
}

.chart-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--vp-c-text-2);
}
</style>
