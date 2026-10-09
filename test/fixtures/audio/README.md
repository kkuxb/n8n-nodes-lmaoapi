`tone.m4a` is a locally synthesized 440 Hz sine wave, 48 kHz mono AAC-LC,
3.3 seconds, with the encoder-delay edit list. No downloaded media or speech.

Created once for independent container regression tests:

```text
ffmpeg -f lavfi -i sine=frequency=440:sample_rate=48000:duration=3.3 -ac 1 -c:a aac -b:a 32k -movflags +faststart tone.m4a
```

Running the package or its unit tests does not require FFmpeg.
