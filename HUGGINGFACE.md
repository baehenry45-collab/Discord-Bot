# Hugging Face 연동 메모

Udon_M1은 Hugging Face를 세 가지 용도로 사용할 수 있게 준비했습니다.

1. 오픈소스 모델 호출  
   Hugging Face Inference Providers의 OpenAI 호환 Chat Completion 엔드포인트를 사용합니다.  
   공식 문서: https://huggingface.co/docs/inference-providers/index

2. 학습 데이터셋 내보내기  
   우돈AI 지식베이스/피드백/좋은 답변 샘플을 JSONL로 내보냅니다.  
   이 파일은 Hugging Face Dataset으로 올리기 쉽게 만들었습니다.

3. 추후 파인튜닝 준비  
   실제 파인튜닝은 Hugging Face 계정, 토큰, 사용 가능한 GPU/Space/AutoTrain/외부 학습 환경이 필요합니다.

## 왜 바로 학습 실행까지 안 넣었나

Hugging Face에 데이터셋을 업로드하거나 학습 작업을 실행하는 것은 외부 계정 상태를 바꾸는 작업입니다.  
토큰이 필요하고, 비용/공개 범위/라이선스 선택도 필요합니다. 그래서 현재 패키지는 “업로드 직전 파일 생성”까지 자동화합니다.

## 사용 방법

```bash
cd outputs/Udon_M1
npm run hf:export
```

결과:

```text
exports/huggingface/udonai-m1-train.jsonl
exports/huggingface/dataset-card.md
```

## Hugging Face에 올리는 흐름

공식 문서에 따르면 데이터셋 업로드는 `huggingface_hub` 또는 CLI 로그인이 필요합니다.

```bash
pip install huggingface_hub
huggingface-cli login
```

그 다음 Dataset repo를 만들고 JSONL을 업로드하면 됩니다.  
데이터셋 공개 전에는 반드시 저작권/개인정보/서버 로그 포함 여부를 확인해야 합니다.

## 추천 모델

작은 서버에서는 모델을 직접 돌리지 말고 HF/TGI/Ollama 서버로 분리하는 것을 추천합니다.

- Qwen/Qwen2.5-7B-Instruct
- google/gemma 계열 instruct 모델
- meta-llama Llama instruct 계열 모델, 사용 조건 확인 필요
- Mistral instruct 계열 모델, 라이선스 확인 필요

모델 라이선스와 사용 조건은 모델 카드에서 반드시 확인해야 합니다.

