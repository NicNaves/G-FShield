package br.com.graspfs.rcl.gr.util;

import com.sun.management.OperatingSystemMXBean;

import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;
import java.lang.management.MemoryUsage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

public class SystemMetricsUtils {

    private static final OperatingSystemMXBean operatingSystemBean =
            ManagementFactory.getPlatformMXBean(OperatingSystemMXBean.class);
    private static final MemoryMXBean memoryBean = ManagementFactory.getMemoryMXBean();
    private static final long MB = 1024L * 1024L;
    private static final List<Path> MEMORY_USAGE_PATHS = List.of(
            Path.of("/sys/fs/cgroup/memory.current"),
            Path.of("/sys/fs/cgroup/memory/memory.usage_in_bytes")
    );
    private static final List<Path> MEMORY_LIMIT_PATHS = List.of(
            Path.of("/sys/fs/cgroup/memory.max"),
            Path.of("/sys/fs/cgroup/memory/memory.limit_in_bytes")
    );

    public static float getCpuUsage() {
        if (operatingSystemBean == null) {
            return 0F;
        }

        double cpuLoad = operatingSystemBean.getProcessCpuLoad();
        if (cpuLoad < 0) {
            try {
                Thread.sleep(100);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            cpuLoad = operatingSystemBean.getProcessCpuLoad();
        }

        return cpuLoad < 0 ? 0F : (float) (cpuLoad * 100);
    }

    public static float getMemoryUsageMB() {
        Long containerUsageBytes = readFirstBytes(MEMORY_USAGE_PATHS);
        if (containerUsageBytes != null) {
            return containerUsageBytes / (float) MB;
        }

        return getJvmUsedMemoryBytes() / (float) MB;
    }

    public static float getMemoryTotalMB() {
        Long containerLimitBytes = readFirstBytes(MEMORY_LIMIT_PATHS);
        if (containerLimitBytes != null && containerLimitBytes > 0) {
            return containerLimitBytes / (float) MB;
        }

        long jvmMaxBytes = Math.max(Runtime.getRuntime().maxMemory(), 1L);
        return jvmMaxBytes / (float) MB;
    }

    public static float getMemoryUsagePercent() {
        float totalMb = getMemoryTotalMB();
        return totalMb <= 0 ? 0F : (getMemoryUsageMB() * 100F / totalMb);
    }

    private static Long readFirstBytes(List<Path> paths) {
        for (Path path : paths) {
            try {
                if (!Files.exists(path)) {
                    continue;
                }

                String raw = Files.readString(path).trim();
                if (raw.isBlank() || "max".equalsIgnoreCase(raw)) {
                    continue;
                }

                return Long.parseLong(raw);
            } catch (Exception ignored) {
                // Fall back to JVM-only metrics below.
            }
        }

        return null;
    }

    private static long getJvmUsedMemoryBytes() {
        MemoryUsage heapUsage = memoryBean.getHeapMemoryUsage();
        MemoryUsage nonHeapUsage = memoryBean.getNonHeapMemoryUsage();
        return Math.max(heapUsage.getUsed(), 0L) + Math.max(nonHeapUsage.getUsed(), 0L);
    }

    public static class MetricsCollector implements Runnable {

        private volatile boolean running = true;
        private int samples = 0;
        private float totalCpu = 0;
        private float totalMemory = 0;
        private float totalMemoryPercent = 0;

        public void run() {
            while (running) {
                float cpu = SystemMetricsUtils.getCpuUsage();
                float mem = SystemMetricsUtils.getMemoryUsageMB();
                float memPercent = SystemMetricsUtils.getMemoryUsagePercent();

                if (!Float.isNaN(cpu) && !Float.isInfinite(cpu)) totalCpu += cpu;
                if (!Float.isNaN(mem) && !Float.isInfinite(mem)) totalMemory += mem;
                if (!Float.isNaN(memPercent) && !Float.isInfinite(memPercent)) totalMemoryPercent += memPercent;

                samples++;
                try {
                    Thread.sleep(100);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
        }

        public void stop() {
            running = false;
        }

        public float getAvgCpu() {
            return samples == 0 ? 0 : totalCpu / samples;
        }

        public float getAvgMemory() {
            return samples == 0 ? 0 : totalMemory / samples;
        }

        public float getAvgMemoryPercent() {
            return samples == 0 ? 0 : totalMemoryPercent / samples;
        }
    }
}
