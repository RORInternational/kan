import type { NextPageWithLayout } from "../_app";
import { getDashboardLayout } from "~/components/Dashboard";
import Popup from "~/components/Popup";
import TaskDumpView from "~/views/task-dump";

const TaskDumpPage: NextPageWithLayout = () => (
  <>
    <TaskDumpView />
    <Popup />
  </>
);

TaskDumpPage.getLayout = (page) => getDashboardLayout(page);

export default TaskDumpPage;
