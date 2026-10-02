import { intakeData, lineItems } from '../data/testData.js';

export async function navigateToIntake(page) {
  await page.getByRole('link', { name: 'Intake' }).click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);
}

export async function fillIntakeTitle(page) {
  await page.getByRole('textbox', { name: 'Enter title' }).fill(intakeData.title);
  await page.waitForTimeout(500);
  await page.getByText('Search for condition').click();
  await page.waitForTimeout(500);
  await page.getByRole('option', { name: intakeData.requestType }).click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Next' }).waitFor({ state: 'visible', timeout: 10000 });
  await page.getByRole('button', { name: 'Next' }).click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);
}

export async function fillDetailsForm(page) {
  await page.locator('.ant-select.ant-select-enabled.ant-select-allow-clear > .ant-select-selection > .ant-select-arrow > .anticon > svg').first().click();
  await page.waitForTimeout(500);
  await page.getByRole('option', { name: intakeData.category }).click();
  await page.waitForTimeout(800);
  await page.getByRole('textbox', { name: 'Enter answer here...' }).nth(1).fill(intakeData.vendor);
  await page.waitForTimeout(500);
  await page.getByPlaceholder('Enter answer here...').nth(3).fill(intakeData.quantity);
  await page.waitForTimeout(500);
  await page.locator('div:nth-child(6) > div:nth-child(2) > .ant-select > .ant-select-selection > .ant-select-arrow > .anticon > svg').click();
  await page.waitForTimeout(500);
  await page.getByRole('option', { name: intakeData.priority }).click();
  await page.waitForTimeout(800);
  await page.locator('div:nth-child(11) > div:nth-child(2) > .ant-select > .ant-select-selection > .ant-select-arrow > .anticon > svg').click();
  await page.waitForTimeout(500);
  await page.getByRole('option', { name: intakeData.expenseType }).click();
  await page.waitForTimeout(800);
  await page.locator('div:nth-child(12) > div:nth-child(2) > .ant-select > .ant-select-selection > .ant-select-arrow > .anticon > svg').click();
  await page.waitForTimeout(500);
  await page.getByRole('option', { name: intakeData.expenseFrequency }).click();
  await page.waitForTimeout(800);
  await page.getByRole('spinbutton').nth(1).fill(intakeData.budget);
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);
}

export async function fillLineItems(page) {
  for (const item of lineItems) {
    const r = item.row;
    await page.getByTestId(`sheet-cell-${r}-product`).click();
    await page.waitForTimeout(500);
    await page.getByTestId(`sheet-cell-${r}-product`).dblclick();
    await page.waitForTimeout(800);
    if (r === 1) {
      await page.locator('._select_1cpe9_170 > .ant-select-selection > .ant-select-selection__rendered > .ant-select-search > .ant-select-search__field__wrap > .ant-select-search__field').fill('b');
      await page.waitForTimeout(500);
    }
    await page.getByRole('option', { name: item.product }).click();
    await page.waitForTimeout(800);
    if (r === 1) {
      await page.getByTestId(`sheet-cell-${r}-delivery_time`).click();
      await page.waitForTimeout(500);
    }
    await page.getByTestId(`sheet-cell-${r}-delivery_time`).dblclick();
    await page.waitForTimeout(800);
    await page.getByRole('textbox', { name: 'Choose a date' }).click();
    await page.waitForTimeout(500);
    await page.getByText(item.date, { exact: true }).click();
    await page.waitForTimeout(500);
    if (r > 1) {
      await page.locator('span').filter({ hasText: 'Product*Product' }).click();
      await page.waitForTimeout(300);
    }
    await page.getByTestId(`sheet-cell-${r}-creator_quantity`).dblclick();
    await page.waitForTimeout(500);
    await page.getByTestId(`sheet-cell-${r}-creator_quantity`).locator('input[type="text"]').fill(item.quantity);
    await page.waitForTimeout(500);
    await page.getByTestId(`sheet-cell-${r}-delivery_location`).click();
    await page.waitForTimeout(500);
    await page.getByTestId(`sheet-cell-${r}-delivery_location`).dblclick();
    await page.waitForTimeout(800);
    await page.keyboard.type(item.location);
    await page.waitForTimeout(500);
    await page.getByRole('option', { name: item.locationOption }).click();
    await page.waitForTimeout(800);
    await page.getByTestId(`sheet-cell-${r}-price`).click();
    await page.waitForTimeout(500);
    await page.getByTestId(`sheet-cell-${r}-price`).dblclick();
    await page.waitForTimeout(500);
    await page.getByTestId(`sheet-cell-${r}-price`).locator('input[type="text"]').fill(item.price);
    await page.waitForTimeout(500);
  }
  await page.locator('h2').filter({ hasText: 'Product Details' }).click();
  await page.waitForTimeout(1500);
}

export async function sendRequest(page) {

  await page.getByRole('button', { name: 'Send Request' }).waitFor({ state: 'visible', timeout: 10000 });
  await page.getByRole('button', { name: 'Send Request' }).click();
  await page.waitForTimeout(1000);

  const modal = page.locator('._approvalSummaryWrapper_1pio8_85');
  const isModalVisible = await modal.isVisible().catch(() => false);
  if (isModalVisible) {
    await page.getByRole('button', { name: 'Send Request' }).last().click();
  }

  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);
}

export async function approveIntake(page) {
  await page.getByRole('button', { name: 'Approve' }).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Approve' }).last().click();
  await page.waitForTimeout(800);
  await page.getByRole('textbox', { name: 'Enter remarks' }).fill(intakeData.remarks);
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Approve' }).last().click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);
}