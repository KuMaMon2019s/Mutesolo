# Extension Sync Test Cases — Compare Web vs Extension
# Run after Qwen's fixes to verify consistency

echo "=== Test 1: Profile Avatar ===" && echo "Web: 渐变圆 + 前2字母大写居中 + 无杂文本" && echo "Ext: 需与 Web 一致" && echo ""
echo "=== Test 2: Agent List Top Spacing ===" && echo "Web: Agent 列表上方有 logo 空间" && echo "Ext: 需留出 logo 占位 + 整体放大 30%" && echo ""
echo "=== Test 3: Agent Progress Ring ===" && echo "Web: 水平进度条" && echo "Ext: 圆环进度条，内径需小（现在太粗不像环）" && echo ""
echo "=== Test 4: Search Box ===" && echo "Web: 输入框 + 搜索按钮" && echo "Ext: 高度 +25%, 按钮背景 #2c6bed" && echo ""
echo "=== Test 5: Task Card UI ===" && echo "Web: status dot + label + title + priority badge + branch/project tags" && echo "Ext: 需与 Web 端卡片布局同步" && echo ""
echo "=== Test 6: Rich Text Editor ===" && echo "Web: BlockNote editor (图文混编)" && echo "Ext: 需支持图文富文本" && echo ""
echo "=== Test 7: No Syntax Reference in Prompt ===" && echo "Ext: Prompt tab 下不应有 Syntax Reference 表格" && echo ""
echo "=== ALL CHECKS DEFINED ==="
