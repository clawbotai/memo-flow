#!/bin/bash

# 设置 Whisper.cpp 环境
# 该脚本会安装 whisper.cpp 并下载中文模型

set -e  # 遇到错误时退出

echo "正在设置 Whisper.cpp 环境..."

# 检查是否已安装 whisper.cpp
if [ ! -d "whisper.cpp" ]; then
    echo "克隆 whisper.cpp 仓库..."
    git clone https://github.com/ggerganov/whisper.cpp.git
else
    echo "whisper.cpp 仓库已存在，跳过克隆"
fi

cd whisper.cpp

# 检查模型目录
mkdir -p ../models

# 下载中文优化的small模型
MODEL_PATH="../models/ggml-small.bin"
if [ ! -f "$MODEL_PATH" ]; then
    echo "下载 ggml-small 模型 (适用于中文)..."
    wget -O "$MODEL_PATH" "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin"
else
    echo "模型 $MODEL_PATH 已存在，跳过下载"
fi

# 编译 whisper.cpp (如果还没有编译)
if [ ! -f "main" ]; then
    echo "编译 whisper.cpp..."
    make
else
    echo "whisper.cpp 已经编译，跳过编译步骤"
fi

echo "Whisper.cpp 环境设置完成!"
echo "模型位置: $MODEL_PATH"
echo "编译程序位置: $(pwd)/main"
echo ""
echo "使用方法:"
echo "  1. 在 .env 文件中设置 WHISPER_PATH=$(pwd)/main"
echo "  2. 在 .env 文件中设置 WHISPER_MODEL_PATH=$MODEL_PATH"
echo "  3. 运行 npm run dev 启动应用"