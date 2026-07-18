const fs = require('fs');
const path = require('path');

const EFFECT_NAME = 'piqabu-monochrome';
const PATCH_MARKER = 'PIQABU_MONOCHROME_PROCESSOR';

function replaceOnce(source, needle, replacement, filePath) {
    const first = source.indexOf(needle);
    if (first === -1) {
        throw new Error(`Piqabu monochrome patch could not find its anchor in ${filePath}`);
    }
    if (source.indexOf(needle, first + needle.length) !== -1) {
        throw new Error(`Piqabu monochrome patch found an ambiguous anchor in ${filePath}`);
    }
    return source.replace(needle, replacement);
}

function patchFile(filePath, transform) {
    const source = fs.readFileSync(filePath, 'utf8');
    if (source.includes(PATCH_MARKER)) return false;

    const patched = transform(source, filePath);
    if (!patched.includes(PATCH_MARKER)) {
        throw new Error(`Piqabu monochrome patch did not mark ${filePath}`);
    }

    try {
        fs.writeFileSync(filePath, patched, 'utf8');
    } catch (error) {
        if (error?.code !== 'EPERM' && error?.code !== 'EACCES') throw error;

        // pnpm may expose package-store files through read-only hard links.
        // Replace this one link with a writable file without altering the store.
        const temporaryPath = `${filePath}.piqabu-patch`;
        fs.writeFileSync(temporaryPath, patched, 'utf8');
        fs.chmodSync(filePath, 0o644);
        fs.unlinkSync(filePath);
        fs.renameSync(temporaryPath, filePath);
    }
    return true;
}

const overrideRoot = process.env.PIQABU_WEBRTC_ROOT;
const packageJsonPath = overrideRoot
    ? path.join(path.resolve(overrideRoot), 'package.json')
    : require.resolve('react-native-webrtc/package.json', {
          paths: [path.resolve(__dirname, '..')],
      });
const webrtcRoot = overrideRoot ? path.resolve(overrideRoot) : path.dirname(packageJsonPath);
const webrtcPackage = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

if (webrtcPackage.version !== '124.0.7') {
    throw new Error(
        `Piqabu monochrome patch is verified for react-native-webrtc 124.0.7, found ${webrtcPackage.version}`,
    );
}

const androidProvider = path.join(
    webrtcRoot,
    'android',
    'src',
    'main',
    'java',
    'com',
    'oney',
    'WebRTCModule',
    'videoEffects',
    'ProcessorProvider.java',
);

const iosProvider = path.join(
    webrtcRoot,
    'ios',
    'RCTWebRTC',
    'videoEffects',
    'ProcessorProvider.m',
);

const androidChanged = patchFile(androidProvider, (source, filePath) => {
    source = replaceOnce(
        source,
        'package com.oney.WebRTCModule.videoEffects;\n\n',
        `package com.oney.WebRTCModule.videoEffects;\n\n` +
            `// ${PATCH_MARKER}\n` +
            `import org.webrtc.JavaI420Buffer;\n` +
            `import org.webrtc.SurfaceTextureHelper;\n` +
            `import org.webrtc.VideoFrame;\n\n` +
            `import java.nio.ByteBuffer;\n`,
        filePath,
    );

    source = replaceOnce(
        source,
        'public class ProcessorProvider {\n',
        `public class ProcessorProvider {\n` +
            `    private static final class MonochromeProcessor implements VideoFrameProcessor {\n` +
            `        @Override\n` +
            `        public VideoFrame process(VideoFrame frame, SurfaceTextureHelper textureHelper) {\n` +
            `            VideoFrame.I420Buffer input = null;\n` +
            `            JavaI420Buffer output = null;\n` +
            `            boolean handedOff = false;\n` +
            `            try {\n` +
            `                input = frame.getBuffer().toI420();\n` +
            `                if (input == null) return null;\n\n` +
            `                int width = input.getWidth();\n` +
            `                int height = input.getHeight();\n` +
            `                output = JavaI420Buffer.allocate(width, height);\n\n` +
            `                copyPlane(input.getDataY(), input.getStrideY(), output.getDataY(),\n` +
            `                        output.getStrideY(), width, height);\n` +
            `                fillNeutralChroma(output.getDataU());\n` +
            `                fillNeutralChroma(output.getDataV());\n\n` +
            `                VideoFrame processed =\n` +
            `                        new VideoFrame(output, frame.getRotation(), frame.getTimestampNs());\n` +
            `                handedOff = true;\n` +
            `                return processed;\n` +
            `            } catch (RuntimeException error) {\n` +
            `                return null;\n` +
            `            } finally {\n` +
            `                if (input != null) input.release();\n` +
            `                if (output != null && !handedOff) output.release();\n` +
            `            }\n` +
            `        }\n\n` +
            `        private static void copyPlane(ByteBuffer source, int sourceStride, ByteBuffer target,\n` +
            `                                      int targetStride, int width, int height) {\n` +
            `            for (int row = 0; row < height; row++) {\n` +
            `                ByteBuffer sourceRow = source.duplicate();\n` +
            `                sourceRow.position(row * sourceStride);\n` +
            `                sourceRow.limit(row * sourceStride + width);\n\n` +
            `                ByteBuffer targetRow = target.duplicate();\n` +
            `                targetRow.position(row * targetStride);\n` +
            `                targetRow.put(sourceRow);\n` +
            `            }\n` +
            `        }\n\n` +
            `        private static void fillNeutralChroma(ByteBuffer plane) {\n` +
            `            ByteBuffer writable = plane.duplicate();\n` +
            `            writable.clear();\n` +
            `            while (writable.hasRemaining()) writable.put((byte) 128);\n` +
            `        }\n` +
            `    }\n\n`,
        filePath,
    );

    return replaceOnce(
        source,
        `    private static Map<String, VideoFrameProcessorFactoryInterface> methodMap =\n` +
            `            new HashMap<String, VideoFrameProcessorFactoryInterface>();\n`,
        `    private static Map<String, VideoFrameProcessorFactoryInterface> methodMap =\n` +
            `            new HashMap<String, VideoFrameProcessorFactoryInterface>();\n\n` +
            `    static {\n` +
            `        addProcessor("${EFFECT_NAME}", MonochromeProcessor::new);\n` +
            `    }\n`,
        filePath,
    );
});

const iosChanged = patchFile(iosProvider, (source, filePath) => {
    source = replaceOnce(
        source,
        '#import "ProcessorProvider.h"\n\n',
        `#import "ProcessorProvider.h"\n\n` +
            `// ${PATCH_MARKER}\n` +
            `#import <CoreVideo/CoreVideo.h>\n` +
            `#import <WebRTC/RTCCVPixelBuffer.h>\n` +
            `#import <WebRTC/RTCVideoFrame.h>\n` +
            `#include <string.h>\n\n` +
            `@interface PiqabuMonochromeFrameProcessor : NSObject <VideoFrameProcessorDelegate>\n` +
            `@end\n\n` +
            `@implementation PiqabuMonochromeFrameProcessor\n\n` +
            `- (RTCVideoFrame *)capturer:(RTCVideoCapturer *)capturer\n` +
            `          didCaptureVideoFrame:(RTCVideoFrame *)frame {\n` +
            `    if (![frame.buffer isKindOfClass:[RTCCVPixelBuffer class]]) return frame;\n\n` +
            `    CVPixelBufferRef source = ((RTCCVPixelBuffer *)frame.buffer).pixelBuffer;\n` +
            `    OSType format = CVPixelBufferGetPixelFormatType(source);\n` +
            `    BOOL isBiPlanar = format == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange ||\n` +
            `                      format == kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange;\n` +
            `    BOOL isBGRA = format == kCVPixelFormatType_32BGRA;\n` +
            `    if (!isBiPlanar && !isBGRA) return frame;\n\n` +
            `    NSDictionary *attributes = @{\n` +
            `        (id)kCVPixelBufferIOSurfacePropertiesKey : @{},\n` +
            `        (id)kCVPixelBufferMetalCompatibilityKey : @YES,\n` +
            `    };\n` +
            `    CVPixelBufferRef output = NULL;\n` +
            `    CVReturn status = CVPixelBufferCreate(\n` +
            `        kCFAllocatorDefault, CVPixelBufferGetWidth(source), CVPixelBufferGetHeight(source),\n` +
            `        format, (__bridge CFDictionaryRef)attributes, &output);\n` +
            `    if (status != kCVReturnSuccess || output == NULL) return frame;\n\n` +
            `    CVReturn sourceLock = CVPixelBufferLockBaseAddress(source, kCVPixelBufferLock_ReadOnly);\n` +
            `    if (sourceLock != kCVReturnSuccess) {\n` +
            `        CVPixelBufferRelease(output);\n` +
            `        return frame;\n` +
            `    }\n` +
            `    CVReturn outputLock = CVPixelBufferLockBaseAddress(output, 0);\n` +
            `    if (outputLock != kCVReturnSuccess) {\n` +
            `        CVPixelBufferUnlockBaseAddress(source, kCVPixelBufferLock_ReadOnly);\n` +
            `        CVPixelBufferRelease(output);\n` +
            `        return frame;\n` +
            `    }\n\n` +
            `    BOOL processed = NO;\n` +
            `    if (isBiPlanar && CVPixelBufferGetPlaneCount(source) == 2 &&\n` +
            `        CVPixelBufferGetPlaneCount(output) == 2) {\n` +
            `        size_t yRows = MIN(CVPixelBufferGetHeightOfPlane(source, 0),\n` +
            `                           CVPixelBufferGetHeightOfPlane(output, 0));\n` +
            `        size_t yBytes = MIN(CVPixelBufferGetBytesPerRowOfPlane(source, 0),\n` +
            `                            CVPixelBufferGetBytesPerRowOfPlane(output, 0));\n` +
            `        uint8_t *sourceY = CVPixelBufferGetBaseAddressOfPlane(source, 0);\n` +
            `        uint8_t *outputY = CVPixelBufferGetBaseAddressOfPlane(output, 0);\n` +
            `        uint8_t *outputUV = CVPixelBufferGetBaseAddressOfPlane(output, 1);\n` +
            `        size_t sourceYStride = CVPixelBufferGetBytesPerRowOfPlane(source, 0);\n` +
            `        size_t outputYStride = CVPixelBufferGetBytesPerRowOfPlane(output, 0);\n` +
            `        size_t outputUVStride = CVPixelBufferGetBytesPerRowOfPlane(output, 1);\n` +
            `        size_t outputUVRows = CVPixelBufferGetHeightOfPlane(output, 1);\n` +
            `        if (sourceY != NULL && outputY != NULL && outputUV != NULL) {\n` +
            `            for (size_t row = 0; row < yRows; row++) {\n` +
            `                memcpy(outputY + row * outputYStride, sourceY + row * sourceYStride, yBytes);\n` +
            `            }\n` +
            `            for (size_t row = 0; row < outputUVRows; row++) {\n` +
            `                memset(outputUV + row * outputUVStride, 128, outputUVStride);\n` +
            `            }\n` +
            `            processed = YES;\n` +
            `        }\n` +
            `    } else if (isBGRA) {\n` +
            `        size_t width = CVPixelBufferGetWidth(source);\n` +
            `        size_t height = CVPixelBufferGetHeight(source);\n` +
            `        size_t sourceStride = CVPixelBufferGetBytesPerRow(source);\n` +
            `        size_t outputStride = CVPixelBufferGetBytesPerRow(output);\n` +
            `        uint8_t *sourceBytes = CVPixelBufferGetBaseAddress(source);\n` +
            `        uint8_t *outputBytes = CVPixelBufferGetBaseAddress(output);\n` +
            `        if (sourceBytes != NULL && outputBytes != NULL) {\n` +
            `          for (size_t row = 0; row < height; row++) {\n` +
            `            uint8_t *sourcePixel = sourceBytes + row * sourceStride;\n` +
            `            uint8_t *outputPixel = outputBytes + row * outputStride;\n` +
            `            for (size_t column = 0; column < width; column++) {\n` +
            `                uint8_t luma = (uint8_t)((29 * sourcePixel[0] + 150 * sourcePixel[1] +\n` +
            `                                          77 * sourcePixel[2]) >> 8);\n` +
            `                outputPixel[0] = luma;\n` +
            `                outputPixel[1] = luma;\n` +
            `                outputPixel[2] = luma;\n` +
            `                outputPixel[3] = sourcePixel[3];\n` +
            `                sourcePixel += 4;\n` +
            `                outputPixel += 4;\n` +
            `            }\n` +
            `          }\n` +
            `          processed = YES;\n` +
            `        }\n` +
            `    }\n\n` +
            `    CVPixelBufferUnlockBaseAddress(output, 0);\n` +
            `    CVPixelBufferUnlockBaseAddress(source, kCVPixelBufferLock_ReadOnly);\n\n` +
            `    if (!processed) {\n` +
            `        CVPixelBufferRelease(output);\n` +
            `        return frame;\n` +
            `    }\n\n` +
            `    RTCCVPixelBuffer *buffer = [[RTCCVPixelBuffer alloc] initWithPixelBuffer:output];\n` +
            `    RTCVideoFrame *monochrome = [[RTCVideoFrame alloc] initWithBuffer:buffer\n` +
            `                                                        rotation:frame.rotation\n` +
            `                                                     timeStampNs:frame.timeStampNs];\n` +
            `    CVPixelBufferRelease(output);\n` +
            `    return monochrome;\n` +
            `}\n\n` +
            `@end\n\n`,
        filePath,
    );

    return replaceOnce(
        source,
        '    processorMap = [[NSMutableDictionary alloc] init];\n',
        `    processorMap = [[NSMutableDictionary alloc] init];\n` +
            `    [processorMap setObject:[PiqabuMonochromeFrameProcessor new]\n` +
            `                    forKey:@"${EFFECT_NAME}"];\n`,
        filePath,
    );
});

console.log(
    `Piqabu WebRTC monochrome processor: Android ${androidChanged ? 'patched' : 'ready'}, ` +
        `iOS ${iosChanged ? 'patched' : 'ready'}.`,
);
