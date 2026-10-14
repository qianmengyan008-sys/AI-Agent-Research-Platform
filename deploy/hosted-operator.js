/* global document */
const form = document.getElementById('operator-form');
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = document.getElementById('operator-status');
  const output = document.getElementById('operator-result');
  output.replaceChildren();
  try {
    const token = document.getElementById('admin-token');
    const response = await fetch('/api/admin/hosted-accounts', {
      headers: { Authorization: `Bearer ${token.value}` },
      cache: 'no-store',
    });
    token.value = '';
    if (!response.ok) throw new Error('管理员验证失败，请检查私下取得的凭据。');
    const data = await response.json();
    status.textContent = `实验编号：${data.experiment_id}。仅向每位测试者私下分发自己的账号和密码。`;
    const table = document.createElement('table');
    for (const account of data.accounts) {
      const row = document.createElement('tr');
      for (const value of [account.participant_code, account.path, account.password]) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      table.append(row);
    }
    output.append(table);
  } catch (error) {
    status.textContent = error.message;
  }
});
