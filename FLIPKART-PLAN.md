When this plan and a step's prompt differ, the step's prompt wins.

12-10-2026: The Campaigns box has no Campaign ID. It is the same as the Amazon box: Brand, Campaign name, Live or ended, Products.

12-10-2026: There is no "Stop Checking" Status. The Statuses are the same as on Amazon: Pass, Fail and Needs Manual Staff Checking.

I have uploaded the Flipkart reviews Excel file, and the dashboard is showing the information correctly.

The table is showing the row number, reviewer name, order ID, order amount, product name, order screenshot, delivery screenshot, review screenshot, and review link.

However, I have found some differences in how Flipkart works compared to Amazon. I want you to update the Flipkart checker to handle these differences properly.

**1. Keep the Amazon checker unchanged**

The Amazon checker is already being built and tested.

Do not change, remove, or break any existing Amazon feature while working on Flipkart.

All the new changes should apply only to the Flipkart checker.

**2. Add product details for Flipkart campaigns**

At the moment, there is no option to add the Flipkart product details.

Please add a section where I can enter:

- Flipkart product link
- Campaign ID
- Product ID

I should be able to add the product link or product ID for each campaign.

The dashboard should open the product page, read the actual product name, and use that information to check the products purchased by users.

**3. Handle missing Flipkart review links**

Many users cannot share a Flipkart review link because they cannot find one or because no separate review link is available.

Unlike Amazon, most users share a screenshot of their review. The dashboard must support this type of evidence.

Do not mark a transaction as failed or send it for manual checking just because the review link is missing.

If a review link is not available, use the review screenshot and check whether the same review can be found on the public Flipkart product page.

**4. Find the user's review on Flipkart**

When I add a product link or product ID, the dashboard should open the correct product page and go to the section where all reviews are shown.

It should collect the reviews that are publicly available through the normal website and that can be checked.

Then it should follow these steps:

First, open the review screenshot provided by the user.

Second, read the reviewer's name and the review text from the screenshot.

Third, open the Flipkart product page and look for the same review among the available public reviews.

Fourth, compare the reviewer's name and review text with the information found on the product page.

If the reviewer's name and review text match, the review check should pass.

If the screenshot shows several reviews, the dashboard must find the correct reviewer first and then check only the review belonging to that person.

Do not compare the user's review with random reviews on the page.

**5. Read screenshots properly**

The dashboard should be able to read different types of screenshots, including screenshots of public review pages where several reviews are shown together.

It should read the reviewer's name and the review text carefully.

If the screenshot contains a shortened name, do not automatically mark it as a mismatch. Check the name and review text together before deciding the result.

If the screenshot is missing, unclear, or cannot be read properly, show the exact reason.

Do not guess missing information or mark something as verified when it has not been checked.

**6. Check the order and delivery screenshots**

Continue checking the order screenshot and delivery screenshot as well.

Compare the order ID, order amount, product name, product image, and other details that are available.

If the information matches, continue to the review check.

If something does not match, show the exact details that are different.

For example:

"Order ID in the purchase screenshot: 1234. Order ID in the delivery screenshot: 5678. The order IDs do not match."

If a screenshot is missing or unclear, mention which screenshot is missing or unclear.

**7. Show the results in the same table**

Once the checks are complete, show the results in the same format as the Amazon checker.

Keep the existing Status, Type, and Note columns.

The Status should show one of these options:

Pass

Fail

Needs Manual

Stop Checking

The Type should show the exact reason for the result.

The Note should explain the result in a short and simple sentence.

The dashboard should only show Pass when all the required checks have been completed successfully. If something cannot be checked, explain why instead of guessing.

**8. Make the process easy to use**

The Flipkart checker should work in the following order:

Upload the Excel file.

Add the Flipkart product link or product ID for the campaign.

Open the product page and get the product details.

Check the order screenshot.

Check the delivery screenshot.

Read the review screenshot.

Find the matching review on the public product page.

Compare the reviewer's name and review text.

Show the final Status, Type, and Note.

The dashboard should show the progress live as each transaction is checked.

**9. Important requirements**

Please inspect the existing project before making changes.

Reuse the current dashboard and its working features wherever possible. Do not create a second, separate dashboard for Flipkart.

Keep the existing Amazon and Flipkart options on the same dashboard.

Use only information that can be accessed through normal, permitted website access. Do not bypass website restrictions. If Flipkart prevents a check or the required information is not available, show the reason and allow manual checking.

Before finishing, test the Flipkart checker with the uploaded Excel file. Check different types of screenshots, missing review links, matching reviews, and mismatched details.

Finally, tell me what you changed, what you tested, what is working, and what still needs to be fixed.

The main goal is to make the Flipkart checker work properly without affecting the Amazon checker.
