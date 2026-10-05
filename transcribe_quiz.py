#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import whisper
import os

# Load Whisper model
print("Loading Whisper model...")
model = whisper.load_model("base")

EN_AUDIO_DIR = "assets/audio/en"

# Transcribe each quiz question
quiz_files = [
    "quiz-ques-1.opus",
    "quiz-ques-2.opus",
    "quiz-ques-3.opus",
    "quiz-ques-4.opus"
]

for filename in quiz_files:
    input_path = os.path.join(EN_AUDIO_DIR, filename)
    print(f"\n{filename}:")
    result = model.transcribe(input_path)
    print(f"  {result['text']}")
