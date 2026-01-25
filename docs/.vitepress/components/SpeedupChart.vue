<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';

const props = defineProps<{
  labels: string[];
  speedups: number[];
}>();

const canvas = ref<HTMLCanvasElement | null>(null);
const isClient = ref(false);

onMounted(async () => {
  isClient.value = true;
  await nextTick();
  if (!canvas.value) return;

  const { Chart, registerables } = await import('chart.js');
  Chart.register(...registerables);

  const colors = props.speedups.map(s => s >= 1
    ? 'rgba(34, 197, 94, 0.8)'   // green for faster
    : 'rgba(239, 68, 68, 0.8)'   // red for slower
  );

  const borderColors = props.speedups.map(s => s >= 1
    ? 'rgb(34, 197, 94)'
    : 'rgb(239, 68, 68)'
  );

  new Chart(canvas.value, {
    type: 'bar',
    data: {
      labels: props.labels,
      datasets: [{
        label: 'Speedup (RPC/Wrapper)',
        data: props.speedups,
        backgroundColor: colors,
        borderColor: borderColors,
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: 'Relative Performance (>1 = wrapper faster)',
          font: { size: 16, weight: 'bold' },
          padding: { bottom: 20 }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: (ctx) => {
              const val = ctx.parsed.x;
              if (val >= 1) {
                return `Wrapper ${val.toFixed(2)}x faster`;
              } else {
                return `RPC ${(1/val).toFixed(2)}x faster`;
              }
            }
          }
        },
        annotation: {
          annotations: {
            line1: {
              type: 'line',
              xMin: 1,
              xMax: 1,
              borderColor: 'rgba(0, 0, 0, 0.3)',
              borderWidth: 2,
              borderDash: [5, 5],
            }
          }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Speedup Factor',
            font: { size: 12 }
          },
          grid: { color: 'rgba(0, 0, 0, 0.05)' }
        },
        y: {
          grid: { display: false },
          ticks: { font: { size: 11 } }
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
  height: 450px;
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
