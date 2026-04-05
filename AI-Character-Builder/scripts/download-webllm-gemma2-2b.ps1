param(
  [string]$TargetDir = "src/assets/models/gemma2/2b"
)

$ErrorActionPreference = "Stop"

$files = @(
  "mlc-chat-config.json",
  "ndarray-cache.json",
  "tensor-cache.json",
  "params_shard_0.bin",
  "params_shard_1.bin",
  "params_shard_2.bin",
  "params_shard_3.bin",
  "params_shard_4.bin",
  "params_shard_5.bin",
  "params_shard_6.bin",
  "params_shard_7.bin",
  "params_shard_8.bin",
  "params_shard_9.bin",
  "params_shard_10.bin",
  "params_shard_11.bin",
  "params_shard_12.bin",
  "params_shard_13.bin",
  "params_shard_14.bin",
  "params_shard_15.bin",
  "params_shard_16.bin",
  "params_shard_17.bin",
  "params_shard_18.bin",
  "params_shard_19.bin",
  "params_shard_20.bin",
  "params_shard_21.bin",
  "params_shard_22.bin",
  "params_shard_23.bin",
  "params_shard_24.bin",
  "params_shard_25.bin",
  "params_shard_26.bin",
  "params_shard_27.bin",
  "params_shard_28.bin",
  "params_shard_29.bin",
  "params_shard_30.bin",
  "params_shard_31.bin",
  "params_shard_32.bin",
  "params_shard_33.bin",
  "params_shard_34.bin",
  "params_shard_35.bin",
  "params_shard_36.bin",
  "params_shard_37.bin",
  "params_shard_38.bin",
  "params_shard_39.bin",
  "params_shard_40.bin",
  "params_shard_41.bin",
  "tokenizer.json",
  "tokenizer.model",
  "tokenizer_config.json"
)

$wasmFile = "gemma-2-2b-it-q4f16_1-ctx4k_cs1k-webgpu.wasm"
$modelRepo = "https://huggingface.co/mlc-ai/gemma-2-2b-it-q4f16_1-MLC/resolve/main"
$wasmUrl = "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/$wasmFile"

New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null

Write-Host "Downloading WebLLM Gemma 2 2B files into $TargetDir"

foreach ($file in $files) {
  $url = "$modelRepo/$file"
  $out = Join-Path $TargetDir $file
  $outDir = Split-Path -Parent $out
  if ($outDir) {
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null
  }
  Write-Host "  $file"
  Invoke-WebRequest -Uri $url -OutFile $out
}

Write-Host "  $wasmFile"
$wasmOut = Join-Path $TargetDir $wasmFile
Invoke-WebRequest -Uri $wasmUrl -OutFile $wasmOut

Write-Host "Done."
