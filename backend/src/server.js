const app = require('./app');
const { startPriorityAging } = require('./modules/queue');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`QueueSmart is running at http://localhost:${PORT}`);
  startPriorityAging(); // raise priority for long waits every minute
});
