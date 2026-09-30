#!/bin/zsh
cd -- "${0:A:h}"
python3 tools/serve.py
if (( $? != 0 )); then
  read '?按回车关闭窗口'
fi
