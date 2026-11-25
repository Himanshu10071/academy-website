import { MyCourses } from "../../../components/course/MyCourses";
import { PaymentSuccessToast } from "../../../components/payment/PaymentSuccessToast";

export default function MyCoursesPage() {
  return <><PaymentSuccessToast destination="/my-courses" /><MyCourses /></>;
}
