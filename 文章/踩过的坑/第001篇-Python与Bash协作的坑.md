# Python与Bash协作的坑

> 创建时间：2026-05-26

## 1. Bash inline Python 引号地狱

**现象**：在 Bash 里直接写 `python -c "..."` 跑 Python 代码，遇到三重引号 `'''` 或嵌套引号时直接炸。

**原因**：Bash 和 Python 各自的引号解析打架，`'''` 在 Bash 里被当成不完整的单引号。

**解决**：把 Python 代码写进独立 .py 文件再执行，别挤在 Bash 一行里。

**教训**：Bash 是壳，Python 是芯，超过 5 行的 Python 别塞在 Bash 命令行里。

## 2. Windows GBK 编码吞 emoji

**现象**：Python 输出中文或 emoji 时报 `UnicodeEncodeError: 'gbk' codec can't encode character`。

**原因**：Windows 终端默认用 GBK 编码，Python 打印 UTF-8 字符时转码失败。

**解决**：在跑 Python 前加一行环境变量：
```
export PYTHONIOENCODING=utf-8
```
或者写进脚本：`import sys; sys.stdout.reconfigure(encoding='utf-8')`

**教训**：Windows 上跑 Python 先设 `PYTHONIOENCODING=utf-8`，省一万个坑。

## 3. Windows Store Python 空壳陷阱

**现象**：在终端敲 `python` 打不开 Python，或者打开的是 Windows Store 的空壳占位程序。

**原因**：Windows 10/11 自带一个假的 `python.exe` 占位符，指向微软商店。

**解决**：用完整路径直接调用真正的 Python：
```
export PATH="/c/Users/32655/AppData/Local/Programs/Python/Python312:$PATH" && python 脚本名.py
```

**教训**：Windows 上不要用裸 `python` 命令，永远用完整路径，或者用 winget 装的 Python 覆盖掉商店空壳。

---

## 相关笔记
- [[第009篇-我的全链路工作流]] — 这个坑就是在搭建自动推送流水线时踩的
