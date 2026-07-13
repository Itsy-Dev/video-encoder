const EncodingOptions = {
    Container: {
        MP4: { id: "mp4", label: "MP4", extension: ".mp4" },
        MKV: { id: "mkv", label: "Matroska", extension: ".mkv" },
        WEBM: { id: "webm", label: "WebM", extension: ".webm" },
        MOV: { id: "mov", label: "QuickTime", extension: ".mov" }
    },

    VideoCodec: {
        H264: { id: "h264", label: "H.264", ffmpeg: "libx264", browserCompatible: true },
        H265: { id: "h265", label: "H.265 / HEVC", ffmpeg: "libx265", browserCompatible: false },
        AV1: { id: "av1", label: "AV1", ffmpeg: "libsvtav1", browserCompatible: true },
        VP9: { id: "vp9", label: "VP9", ffmpeg: "libvpx-vp9", browserCompatible: true },
        COPY: { id: "copy", label: "Copy", ffmpeg: "copy" }
    },

    AudioCodec: {
        AAC: { id: "aac", label: "AAC", ffmpeg: "aac", browserCompatible: true },
        OPUS: { id: "opus", label: "Opus", ffmpeg: "libopus", browserCompatible: true },
        MP3: { id: "mp3", label: "MP3", ffmpeg: "libmp3lame", browserCompatible: true },
        COPY: { id: "copy", label: "Copy", ffmpeg: "copy" }
    },

    Resolution: {
        ORIGINAL: { id: "original", label: "Original", width: null, height: null },
        P720: { id: "720p", label: "720p", width: 1280, height: 720 },
        P1080: { id: "1080p", label: "1080p", width: 1920, height: 1080 },
        P1440: { id: "1440p", label: "1440p", width: 2560, height: 1440 },
        P2160: { id: "2160p", label: "2160p (4K)", width: 3840, height: 2160 }
    },

    Preset: {
        ULTRAFAST: { id: "ultrafast", label: "Ultra Fast" },
        SUPERFAST: { id: "superfast", label: "Super Fast" },
        VERYFAST: { id: "veryfast", label: "Very Fast" },
        FASTER: { id: "faster", label: "Faster" },
        FAST: { id: "fast", label: "Fast" },
        MEDIUM: { id: "medium", label: "Medium" },
        SLOW: { id: "slow", label: "Slow" },
        SLOWER: { id: "slower", label: "Slower" },
        VERYSLOW: { id: "veryslow", label: "Very Slow" }
    },

    Tune: {
        NONE: { id: null, label: "None" },
        FILM: { id: "film", label: "Film" },
        ANIMATION: { id: "animation", label: "Animation" },
        GRAIN: { id: "grain", label: "Grain" },
        STILLIMAGE: { id: "stillimage", label: "Still Image" },
        FASTDECODE: { id: "fastdecode", label: "Fast Decode" },
        ZEROLATENCY: { id: "zerolatency", label: "Zero Latency" }
    },

    PixelFormat: {
        YUV420P: { id: "yuv420p", label: "YUV 4:2:0", browserCompatible: true },
        YUV422P: { id: "yuv422p", label: "YUV 4:2:2" },
        YUV444P: { id: "yuv444p", label: "YUV 4:4:4" }
    },

    Profile: {
        BASELINE: { id: "baseline", label: "Baseline" },
        MAIN: { id: "main", label: "Main" },
        HIGH: { id: "high", label: "High" }
    },

    Level: {
        AUTO: { id: null, label: "Auto" },
        L40: { id: "4.0", label: "4.0" },
        L41: { id: "4.1", label: "4.1" },
        L50: { id: "5.0", label: "5.0" },
        L51: { id: "5.1", label: "5.1" },
        L52: { id: "5.2", label: "5.2" }
    },

    AudioBitrate: {
        COPY: { id: null, label: "Copy" },
        K96: { id: 96000, label: "96 kbps" },
        K128: { id: 128000, label: "128 kbps" },
        K160: { id: 160000, label: "160 kbps" },
        K192: { id: 192000, label: "192 kbps" },
        K256: { id: 256000, label: "256 kbps" },
        K320: { id: 320000, label: "320 kbps" }
    },

    AudioChannels: {
        COPY: { id: null, label: "Copy" },
        MONO: { id: 1, label: "Mono" },
        STEREO: { id: 2, label: "Stereo" },
        SURROUND_51: { id: 6, label: "5.1 Surround" }
    },

    SampleRate: {
        COPY: { id: null, label: "Copy" },
        KHZ44: { id: 44100, label: "44.1 kHz" },
        KHZ48: { id: 48000, label: "48 kHz" }
    },

    FastStart: {
        AUTO: { id: null, label: "Auto" },
        ON: { id: true, label: "Enabled" },
        OFF: { id: false, label: "Disabled" }
    },

    SubtitleMode: {
        COPY: { id: "copy", label: "Copy" },
        REMOVE: { id: "remove", label: "Remove" },
        BURN: { id: "burn", label: "Burn In" }
    },

    Metadata: {
        COPY: { id: "copy", label: "Copy" },
        STRIP: { id: "strip", label: "Strip" }
    },

    Chapters: {
        COPY: { id: "copy", label: "Copy" },
        REMOVE: { id: "remove", label: "Remove" }
    },

    HardwareAcceleration: {
        CPU: { id: "cpu", label: "CPU" },
        VIDEOTOOLBOX: { id: "videotoolbox", label: "Apple VideoToolbox" },
        NVENC: { id: "nvenc", label: "NVIDIA NVENC" },
        QSV: { id: "qsv", label: "Intel Quick Sync" },
        AMF: { id: "amf", label: "AMD AMF" }
    },

    ThreadMode: {
        AUTO: { id: "auto", label: "Automatic" },
        FIXED: { id: "fixed", label: "Fixed" }
    },

    CRF: {
        MIN: 0,
        MAX: 51,
        DEFAULT: 20,
        RECOMMENDED: [17, 18, 20, 22, 24, 26, 28]
    },

    ScalingAlgorithm: {
        AUTO: { id: null, label: "Automatic" },
        BICUBIC: { id: "bicubic", label: "Bicubic" },
        BILINEAR: { id: "bilinear", label: "Bilinear" },
        LANCZOS: { id: "lanczos", label: "Lanczos" },
        SPLINE: { id: "spline", label: "Spline" }
    }
};

module.exports = Object.freeze(EncodingOptions);
