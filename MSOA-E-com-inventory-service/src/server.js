require("dotenv").config();
const app = require("./app");

const PORT = process.env.PORT || 8083;

app.listen(PORT, () => {
  console.log(`Inventory service running on http://localhost:${PORT}`);
});