@echo off
REM Windows 批处理脚本 - 测试 MaibaoAPI timestamp_granularities 参数

echo ========================================
echo 测试 MaibaoAPI timestamp_granularities
echo ========================================
echo.

REM 请在这里填入你的 API Key
set API_KEY=YOUR_API_KEY_HERE

REM 请在这里填入测试音频文件路径
set AUDIO_FILE=test_audio.mp3

set BASE_URL=https://api.maibao.chat/v1

echo 请确保：
echo 1. 已安装 curl（Windows 10+ 自带）
echo 2. 已将 API_KEY 替换为你的真实 API Key
echo 3. 已准备测试音频文件（mp3 格式）
echo.
pause

echo.
echo === 测试 1: 使用 timestamp_granularities[] ===
curl -X POST "%BASE_URL%/audio/transcriptions" ^
  -H "Authorization: Bearer %API_KEY%" ^
  -F "file=@%AUDIO_FILE%" ^
  -F "model=whisper-1" ^
  -F "response_format=verbose_json" ^
  -F "timestamp_granularities[]=word" ^
  -o test1_result.json

echo.
echo === 测试 2: 使用 timestamp_granularities (无[]) ===
curl -X POST "%BASE_URL%/audio/transcriptions" ^
  -H "Authorization: Bearer %API_KEY%" ^
  -F "file=@%AUDIO_FILE%" ^
  -F "model=whisper-1" ^
  -F "response_format=verbose_json" ^
  -F "timestamp_granularities=word" ^
  -o test2_result.json

echo.
echo === 测试 3: 不使用 timestamp_granularities (对照组) ===
curl -X POST "%BASE_URL%/audio/transcriptions" ^
  -H "Authorization: Bearer %API_KEY%" ^
  -F "file=@%AUDIO_FILE%" ^
  -F "model=whisper-1" ^
  -F "response_format=verbose_json" ^
  -o test3_result.json

echo.
echo ========================================
echo 测试完成！
echo ========================================
echo.
echo 请检查以下文件：
echo - test1_result.json (使用 timestamp_granularities[])
echo - test2_result.json (使用 timestamp_granularities)
echo - test3_result.json (不使用参数)
echo.
echo 查看结果中是否包含：
echo - "words" 字段 = 支持词级别时间戳
echo - "segments" 字段 = 只支持分段级别时间戳
echo.
pause
