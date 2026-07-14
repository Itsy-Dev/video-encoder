const AspectFamily = {
    LANDSCAPE_16_9: {
        id: "landscape_16_9",
        label: "Landscape 16:9",
        ratio: 16 / 9,
        tolerance: 0.04,
        orientation: "landscape"
    },
    LANDSCAPE_16_10: {
        id: "landscape_16_10",
        label: "Landscape 16:10",
        ratio: 16 / 10,
        tolerance: 0.035,
        orientation: "landscape"
    },
    CINEMA_17_9: {
        id: "cinema_17_9",
        label: "Cinema 17:9",
        ratio: 17 / 9,
        tolerance: 0.035,
        orientation: "landscape"
    },
    LEGACY_4_3: {
        id: "legacy_4_3",
        label: "Legacy 4:3",
        ratio: 4 / 3,
        tolerance: 0.04,
        orientation: "landscape"
    },
    SQUARE_1_1: {
        id: "square_1_1",
        label: "Square 1:1",
        ratio: 1,
        tolerance: 0.02,
        orientation: "square"
    },
    PORTRAIT_9_16: {
        id: "portrait_9_16",
        label: "Portrait 9:16",
        ratio: 9 / 16,
        tolerance: 0.04,
        orientation: "portrait"
    },
    CUSTOM: {
        id: "custom",
        label: "Custom",
        ratio: null,
        tolerance: null,
        orientation: "custom"
    }
};

const ResolutionTier = {
    ORIGINAL: { id: "original", label: "Original", order: 99, maxBox: null },
    UHD: { id: "uhd", label: "UHD / 4K", order: 4, maxBox: { width: 3840, height: 2160 } },
    QHD: { id: "qhd", label: "QHD / 1440p", order: 3, maxBox: { width: 2560, height: 1440 } },
    HD: { id: "hd", label: "HD / 1080p", order: 2, maxBox: { width: 1920, height: 1080 } },
    SD: { id: "sd", label: "SD / 720p", order: 1, maxBox: { width: 1280, height: 720 } }
};

const ResolutionStandard = {
    WEB_UHD: { id: "web_uhd", label: "Web UHD", width: 3840, height: 2160, familyId: AspectFamily.LANDSCAPE_16_9.id, tierId: ResolutionTier.UHD.id },
    WEB_QHD: { id: "web_qhd", label: "Web QHD", width: 2560, height: 1440, familyId: AspectFamily.LANDSCAPE_16_9.id, tierId: ResolutionTier.QHD.id },
    WEB_HD: { id: "web_hd", label: "Web HD", width: 1920, height: 1080, familyId: AspectFamily.LANDSCAPE_16_9.id, tierId: ResolutionTier.HD.id },
    WEB_SD: { id: "web_sd", label: "Web SD", width: 1280, height: 720, familyId: AspectFamily.LANDSCAPE_16_9.id, tierId: ResolutionTier.SD.id },
    WIDE_UHD: { id: "wide_uhd", label: "Wide UHD", width: 3840, height: 2400, familyId: AspectFamily.LANDSCAPE_16_10.id, tierId: ResolutionTier.UHD.id },
    WIDE_QHD: { id: "wide_qhd", label: "Wide QHD", width: 2560, height: 1600, familyId: AspectFamily.LANDSCAPE_16_10.id, tierId: ResolutionTier.QHD.id },
    WIDE_HD: { id: "wide_hd", label: "Wide HD", width: 1920, height: 1200, familyId: AspectFamily.LANDSCAPE_16_10.id, tierId: ResolutionTier.HD.id },
    WIDE_SD: { id: "wide_sd", label: "Wide SD", width: 1280, height: 800, familyId: AspectFamily.LANDSCAPE_16_10.id, tierId: ResolutionTier.SD.id },
    DCI_4K: { id: "dci_4k", label: "DCI 4K", width: 4096, height: 2160, familyId: AspectFamily.CINEMA_17_9.id, tierId: ResolutionTier.UHD.id },
    DCI_2K: { id: "dci_2k", label: "DCI 2K", width: 2048, height: 1080, familyId: AspectFamily.CINEMA_17_9.id, tierId: ResolutionTier.HD.id },
    LEGACY_UHD: { id: "legacy_uhd", label: "Legacy UHD", width: 2880, height: 2160, familyId: AspectFamily.LEGACY_4_3.id, tierId: ResolutionTier.UHD.id },
    LEGACY_HD: { id: "legacy_hd", label: "Legacy HD", width: 1440, height: 1080, familyId: AspectFamily.LEGACY_4_3.id, tierId: ResolutionTier.HD.id },
    SQUARE_UHD: { id: "square_uhd", label: "Square UHD", width: 2160, height: 2160, familyId: AspectFamily.SQUARE_1_1.id, tierId: ResolutionTier.UHD.id },
    SQUARE_HD: { id: "square_hd", label: "Square HD", width: 1080, height: 1080, familyId: AspectFamily.SQUARE_1_1.id, tierId: ResolutionTier.HD.id },
    SQUARE_SD: { id: "square_sd", label: "Square SD", width: 720, height: 720, familyId: AspectFamily.SQUARE_1_1.id, tierId: ResolutionTier.SD.id },
    VERTICAL_UHD: { id: "vertical_uhd", label: "Vertical UHD", width: 2160, height: 3840, familyId: AspectFamily.PORTRAIT_9_16.id, tierId: ResolutionTier.UHD.id },
    VERTICAL_QHD: { id: "vertical_qhd", label: "Vertical QHD", width: 1440, height: 2560, familyId: AspectFamily.PORTRAIT_9_16.id, tierId: ResolutionTier.QHD.id },
    VERTICAL_HD: { id: "vertical_hd", label: "Vertical HD", width: 1080, height: 1920, familyId: AspectFamily.PORTRAIT_9_16.id, tierId: ResolutionTier.HD.id },
    VERTICAL_SD: { id: "vertical_sd", label: "Vertical SD", width: 720, height: 1280, familyId: AspectFamily.PORTRAIT_9_16.id, tierId: ResolutionTier.SD.id }
};

const ScaleMode = {
    PRESERVE_SOURCE: { id: "preserve_source", label: "Preserve Source" },
    MATCH_SOURCE_FAMILY: { id: "match_source_family", label: "Match Source Family" }
};

const TierFallback = {
    PRESERVE_SOURCE: { id: "preserve_source", label: "Preserve Source" },
    NEXT_LOWER: { id: "next_lower", label: "Next Lower Tier" },
    LOWEST_AVAILABLE: { id: "lowest_available", label: "Lowest Available Tier" }
};

const CustomFamilyFallback = {
    PRESERVE_SOURCE: { id: "preserve_source", label: "Preserve Source" },
    SAFE_FIT: { id: "safe_fit", label: "Safe Fit Within Tier Box" }
};

const ProfileIntent = {
    BROWSER_COMPATIBILITY: { id: "browser_compatibility", label: "Browser Compatibility" },
    RECOMPRESS: { id: "recompress", label: "Recompress" },
    DOWNSCALE: { id: "downscale", label: "Downscale" },
    DOWNSCALE_AND_COMPRESS: { id: "downscale_and_compress", label: "Downscale + Compress" },
    REMUX: { id: "remux", label: "Remux / Copy" }
};

const Container = {
    MP4: { id: "mp4", label: "MP4", extension: ".mp4" },
    MKV: { id: "mkv", label: "Matroska", extension: ".mkv" },
    WEBM: { id: "webm", label: "WebM", extension: ".webm" },
    MOV: { id: "mov", label: "QuickTime", extension: ".mov" }
};

const VideoCodec = {
    H264: { id: "h264", label: "H.264", ffmpeg: "libx264", browserCompatible: true },
    H265: { id: "h265", label: "H.265 / HEVC", ffmpeg: "libx265", browserCompatible: false },
    AV1: { id: "av1", label: "AV1", ffmpeg: "libsvtav1", browserCompatible: true },
    VP9: { id: "vp9", label: "VP9", ffmpeg: "libvpx-vp9", browserCompatible: true },
    COPY: { id: "copy", label: "Copy", ffmpeg: "copy" }
};

const AudioCodec = {
    AAC: { id: "aac", label: "AAC", ffmpeg: "aac", browserCompatible: true },
    OPUS: { id: "opus", label: "Opus", ffmpeg: "libopus", browserCompatible: true },
    MP3: { id: "mp3", label: "MP3", ffmpeg: "libmp3lame", browserCompatible: true },
    COPY: { id: "copy", label: "Copy", ffmpeg: "copy" }
};

const Preset = {
    ULTRAFAST: { id: "ultrafast", label: "Ultra Fast" },
    SUPERFAST: { id: "superfast", label: "Super Fast" },
    VERYFAST: { id: "veryfast", label: "Very Fast" },
    FASTER: { id: "faster", label: "Faster" },
    FAST: { id: "fast", label: "Fast" },
    MEDIUM: { id: "medium", label: "Medium" },
    SLOW: { id: "slow", label: "Slow" },
    SLOWER: { id: "slower", label: "Slower" },
    VERYSLOW: { id: "veryslow", label: "Very Slow" }
};

const Tune = {
    NONE: { id: null, label: "None" },
    FILM: { id: "film", label: "Film" },
    ANIMATION: { id: "animation", label: "Animation" },
    GRAIN: { id: "grain", label: "Grain" },
    STILLIMAGE: { id: "stillimage", label: "Still Image" },
    FASTDECODE: { id: "fastdecode", label: "Fast Decode" },
    ZEROLATENCY: { id: "zerolatency", label: "Zero Latency" }
};

const PixelFormat = {
    YUV420P: { id: "yuv420p", label: "YUV 4:2:0", browserCompatible: true },
    YUV422P: { id: "yuv422p", label: "YUV 4:2:2" },
    YUV444P: { id: "yuv444p", label: "YUV 4:4:4" }
};

const Profile = {
    BASELINE: { id: "baseline", label: "Baseline" },
    MAIN: { id: "main", label: "Main" },
    HIGH: { id: "high", label: "High" }
};

const Level = {
    AUTO: { id: null, label: "Auto" },
    L40: { id: "4.0", label: "4.0" },
    L41: { id: "4.1", label: "4.1" },
    L50: { id: "5.0", label: "5.0" },
    L51: { id: "5.1", label: "5.1" },
    L52: { id: "5.2", label: "5.2" }
};

const AudioBitrate = {
    COPY: { id: null, label: "Copy" },
    K96: { id: 96000, label: "96 kbps" },
    K128: { id: 128000, label: "128 kbps" },
    K160: { id: 160000, label: "160 kbps" },
    K192: { id: 192000, label: "192 kbps" },
    K256: { id: 256000, label: "256 kbps" },
    K320: { id: 320000, label: "320 kbps" }
};

const AudioChannels = {
    COPY: { id: null, label: "Copy" },
    MONO: { id: 1, label: "Mono" },
    STEREO: { id: 2, label: "Stereo" },
    SURROUND_51: { id: 6, label: "5.1 Surround" }
};

const SampleRate = {
    COPY: { id: null, label: "Copy" },
    KHZ44: { id: 44100, label: "44.1 kHz" },
    KHZ48: { id: 48000, label: "48 kHz" }
};

const FastStart = {
    AUTO: { id: null, label: "Auto" },
    ON: { id: true, label: "Enabled" },
    OFF: { id: false, label: "Disabled" }
};

const SubtitleMode = {
    COPY: { id: "copy", label: "Copy" },
    REMOVE: { id: "remove", label: "Remove" },
    BURN: { id: "burn", label: "Burn In" }
};

const Metadata = {
    COPY: { id: "copy", label: "Copy" },
    STRIP: { id: "strip", label: "Strip" }
};

const Chapters = {
    COPY: { id: "copy", label: "Copy" },
    REMOVE: { id: "remove", label: "Remove" }
};

const HardwareAcceleration = {
    CPU: { id: "cpu", label: "CPU" },
    VIDEOTOOLBOX: { id: "videotoolbox", label: "Apple VideoToolbox" },
    NVENC: { id: "nvenc", label: "NVIDIA NVENC" },
    QSV: { id: "qsv", label: "Intel Quick Sync" },
    AMF: { id: "amf", label: "AMD AMF" }
};

const ThreadMode = {
    AUTO: { id: "auto", label: "Automatic" },
    FIXED: { id: "fixed", label: "Fixed" }
};

const CRF = {
    MIN: 0,
    MAX: 51,
    DEFAULT: 20,
    RECOMMENDED: [17, 18, 20, 22, 24, 26, 28]
};

const ScalingAlgorithm = {
    AUTO: { id: null, label: "Automatic" },
    BICUBIC: { id: "bicubic", label: "Bicubic" },
    BILINEAR: { id: "bilinear", label: "Bilinear" },
    LANCZOS: { id: "lanczos", label: "Lanczos" },
    SPLINE: { id: "spline", label: "Spline" }
};

const familyOrder = [
    AspectFamily.CINEMA_17_9,
    AspectFamily.LANDSCAPE_16_10,
    AspectFamily.LANDSCAPE_16_9,
    AspectFamily.LEGACY_4_3,
    AspectFamily.SQUARE_1_1,
    AspectFamily.PORTRAIT_9_16
];

const familyStandards = Object.freeze({
    [AspectFamily.LANDSCAPE_16_9.id]: [ResolutionStandard.WEB_UHD, ResolutionStandard.WEB_QHD, ResolutionStandard.WEB_HD, ResolutionStandard.WEB_SD],
    [AspectFamily.LANDSCAPE_16_10.id]: [ResolutionStandard.WIDE_UHD, ResolutionStandard.WIDE_QHD, ResolutionStandard.WIDE_HD, ResolutionStandard.WIDE_SD],
    [AspectFamily.CINEMA_17_9.id]: [ResolutionStandard.DCI_4K, ResolutionStandard.DCI_2K],
    [AspectFamily.LEGACY_4_3.id]: [ResolutionStandard.LEGACY_UHD, ResolutionStandard.LEGACY_HD],
    [AspectFamily.SQUARE_1_1.id]: [ResolutionStandard.SQUARE_UHD, ResolutionStandard.SQUARE_HD, ResolutionStandard.SQUARE_SD],
    [AspectFamily.PORTRAIT_9_16.id]: [ResolutionStandard.VERTICAL_UHD, ResolutionStandard.VERTICAL_QHD, ResolutionStandard.VERTICAL_HD, ResolutionStandard.VERTICAL_SD],
    [AspectFamily.CUSTOM.id]: []
});

function getAspectFamilies() {
    return familyOrder.concat(AspectFamily.CUSTOM);
}

function getAspectFamilyById(id) {
    return getAspectFamilies().find(family => family.id === id) || null;
}

function getResolutionTiers() {
    return [ResolutionTier.ORIGINAL, ResolutionTier.UHD, ResolutionTier.QHD, ResolutionTier.HD, ResolutionTier.SD];
}

function getResolutionTierById(id) {
    return getResolutionTiers().find(tier => tier.id === id) || null;
}

function getStandardsForFamily(familyId) {
    return (familyStandards[familyId] || []).slice();
}

function getStandardForFamilyTier(familyId, tierId) {
    return getStandardsForFamily(familyId).find(standard => standard.tierId === tierId) || null;
}

const EncodingOptions = {
    AspectFamily,
    ResolutionTier,
    ResolutionStandard,
    ScaleMode,
    TierFallback,
    CustomFamilyFallback,
    ProfileIntent,
    Container,
    VideoCodec,
    AudioCodec,
    Preset,
    Tune,
    PixelFormat,
    Profile,
    Level,
    AudioBitrate,
    AudioChannels,
    SampleRate,
    FastStart,
    SubtitleMode,
    Metadata,
    Chapters,
    HardwareAcceleration,
    ThreadMode,
    CRF,
    ScalingAlgorithm,
    getAspectFamilies,
    getAspectFamilyById,
    getResolutionTiers,
    getResolutionTierById,
    getStandardsForFamily,
    getStandardForFamilyTier
};

module.exports = Object.freeze(EncodingOptions);
